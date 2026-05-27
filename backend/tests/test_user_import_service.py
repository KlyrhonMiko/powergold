import asyncio
import io

from fastapi import UploadFile
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from systems.admin.models.user import User
from systems.admin.models.user_import_history import UserImportHistory
from systems.admin.services.user_import_service import UserImportService
from systems.auth.models.settings import AuthConfig


def _build_engine():
    return create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )


def _seed_configs(session: Session) -> None:
    session.add(AuthConfig(key="staff", value="STAFF", category="users_role"))
    session.add(AuthConfig(key="borrower", value="BORR", category="users_role"))
    session.add(AuthConfig(key="day", value="Day", category="users_shift_type"))
    session.add(AuthConfig(key="night", value="Night", category="users_shift_type"))
    session.commit()


def _seed_admin_user(session: Session) -> User:
    admin = User(
        user_id="ADMIN-0001",
        username="admin01",
        hashed_password="hashed-password",
        first_name="Admin",
        last_name="User",
        role="admin",
        shift_type="day",
        employee_id="EMP-ADMIN-1",
    )
    session.add(admin)
    session.commit()
    session.refresh(admin)
    return admin


def test_user_import_template_contains_expected_headers() -> None:
    service = UserImportService()

    template = service.build_template_csv().strip().splitlines()

    assert template[0] == "employee_id,first_name,last_name,middle_name,email,contact_number,role,shift_type"


def test_user_import_preview_flags_email_conflicts_and_normalizes_shift_labels() -> None:
    engine = _build_engine()
    SQLModel.metadata.create_all(engine)
    service = UserImportService()

    with Session(engine) as session:
        _seed_configs(session)
        _seed_admin_user(session)
        session.add(
            User(
                user_id="USER-0001",
                username="EMP-1001",
                hashed_password="hashed",
                first_name="Existing",
                last_name="User",
                role="staff",
                shift_type="day",
                employee_id="EMP-1001",
                email="taken@example.com",
            )
        )
        session.commit()

        upload = UploadFile(
            filename="users.csv",
            file=io.BytesIO(b"employee_id,first_name,last_name,email,role,shift_type\nEMP-2001,Alex,Rivera,taken@example.com,staff,Day\n"),
        )
        preview = asyncio.run(service.create_preview(session, upload, actor_id=None))

    assert len(preview.row_previews) == 1
    row = preview.row_previews[0]
    assert row.status == "error"
    assert row.resolved_values["shift_type"] == "day"
    assert any(issue.code == "email_conflict" for issue in row.issues)


def test_user_import_apply_creates_users_and_generates_credentials() -> None:
    engine = _build_engine()
    SQLModel.metadata.create_all(engine)
    service = UserImportService()

    with Session(engine) as session:
        _seed_configs(session)
        admin = _seed_admin_user(session)

        upload = UploadFile(
            filename="users.csv",
            file=io.BytesIO(
                (
                    "employee_id,first_name,last_name,role,shift_type,email\n"
                    "EMP-2001,Alex,Rivera,staff,day,alex@example.com\n"
                    "EMP-2002,Bella,Cruz,borrower,day,\n"
                ).encode("utf-8")
            ),
        )
        preview = asyncio.run(service.create_preview(session, upload, actor_id=admin.id))
        history = asyncio.run(service.apply_preview(session, preview.id))

        created_users = list(session.exec(select(User).where(User.employee_id.in_(["EMP-2001", "EMP-2002"]))).all())
        stored_history = session.exec(select(UserImportHistory).where(UserImportHistory.id == history.id)).one()

    assert len(created_users) == 2
    assert stored_history.success_count == 2
    assert stored_history.error_count == 0
    assert len(preview.credentials_rows) == 2
    staff_credentials = next(row for row in preview.credentials_rows if row["employee_id"] == "EMP-2001")
    borrower_credentials = next(row for row in preview.credentials_rows if row["employee_id"] == "EMP-2002")
    assert len(staff_credentials["generated_login_password_or_pin"]) >= 12
    assert any(char.isdigit() for char in staff_credentials["generated_login_password_or_pin"])
    assert borrower_credentials["generated_login_password_or_pin"].isdigit()
    assert len(borrower_credentials["generated_login_password_or_pin"]) == 6

    credentials_csv = service.build_credentials_csv(preview.id)
    assert "generated_login_password_or_pin" in credentials_csv
    assert "EMP-2001" in credentials_csv
    history_csv = service.build_credentials_csv_from_history(session, str(history.id))
    assert "EMP-2002" in history_csv


def test_user_import_update_also_generates_credentials() -> None:
    engine = _build_engine()
    SQLModel.metadata.create_all(engine)
    service = UserImportService()

    with Session(engine) as session:
        _seed_configs(session)
        admin = _seed_admin_user(session)
        existing = User(
            user_id="USER-0009",
            username="EMP-9001",
            hashed_password="hashed",
            first_name="Old",
            last_name="Name",
            role="staff",
            shift_type="day",
            employee_id="EMP-9001",
            email="old@example.com",
        )
        session.add(existing)
        session.commit()

        upload = UploadFile(
            filename="users.csv",
            file=io.BytesIO(
                (
                    "employee_id,first_name,last_name,role,shift_type,email\n"
                    "EMP-9001,New,Name,staff,day,new@example.com\n"
                ).encode("utf-8")
            ),
        )
        preview = asyncio.run(service.create_preview(session, upload, actor_id=admin.id))
        history = asyncio.run(service.apply_preview(session, preview.id))

        updated = session.exec(select(User).where(User.employee_id == "EMP-9001")).one()
        history_csv = service.build_credentials_csv_from_history(session, str(history.id))

    assert history.success_count == 1
    assert updated.first_name == "New"
    assert "EMP-9001" in history_csv
    assert "updated" in history_csv
    generated_code = next(line for line in history_csv.splitlines() if "EMP-9001" in line).split(",")[6]
    assert len(generated_code) >= 12
    assert any(char.isdigit() for char in generated_code)
