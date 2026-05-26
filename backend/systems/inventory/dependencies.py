from fastapi import Depends, HTTPException, status
from sqlmodel import Session

from core.database import engine
from systems.admin.services.audit_service import audit_service
from systems.admin.models.user import User
from core.deps import get_current_user


def _log_shift_guard_bypass(actor_id, shift_type: str | None, role: str | None) -> None:
    """Persist shift-guard bypass telemetry without committing request session state."""
    try:
        with Session(engine) as audit_session:
            audit_service.log_action(
                db=audit_session,
                entity_type="security",
                entity_id="shift_guard",
                action="admin_shift_guard_bypass",
                actor_id=actor_id,
                after={
                    "shift_type": shift_type,
                    "role": role,
                },
            )
            audit_session.commit()
    except Exception:
        # Shift guard enforcement should not fail due to telemetry write issues.
        pass

def shift_guard(
    current_user: User = Depends(get_current_user),
):
    """Prevents inventory changes during unauthorized shifts."""
    shift_type = (current_user.shift_type or "").lower()
    role = (current_user.role or "").lower()

    if shift_type in ["night", "evening"] and role == "admin":
        _log_shift_guard_bypass(
            current_user.id,
            current_user.shift_type,
            current_user.role,
        )
        return current_user

    if shift_type in ["night", "evening"] and role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{shift_type.capitalize()} shift users are restricted from performing inventory adjustments."
        )
    return current_user
