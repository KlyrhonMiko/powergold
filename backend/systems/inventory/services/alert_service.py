import json
import threading
from typing import Any
from sqlmodel import Session, select
from systems.inventory.services.configuration_service import InventoryConfigService
from systems.admin.models.user import User
from systems.inventory.quantity import format_quantity
from utils.logging import get_logger
from utils.mailing import send_email


logger = get_logger("inventory.alerts")

class AlertService:
    def __init__(self):
        self.config_service = InventoryConfigService()

    def evaluate_stock_alerts(self, session: Session, item_id: str):
        """
        Evaluate if an inventory item has crossed thresholds and trigger notifications.
        """
        from systems.inventory.services.inventory_service import InventoryService
        inv_service = InventoryService()
        
        item = inv_service.get(session, item_id)
        if not item:
            return

        balances = inv_service.get_item_balances(session, item)
        if balances["total_qty"] <= 0:
            return

        # Fetch Policy Settings
        configs = self.config_service.get_by_category(session, "inventory_threshold_alerts")
        thresholds = {c.key: c.value for c in configs}
        
        low_stock_pct = int(thresholds.get("low_stock_threshold", "20"))
        overstock_pct = int(thresholds.get("overstock_threshold", "150"))
        
        # Parse Lists (Stored as JSON strings in DB)
        try:
            channels = json.loads(thresholds.get("notification_channels", '["in-app"]'))
            recipient_roles = json.loads(thresholds.get("alert_recipient_roles", '["inventory_manager"]'))
            specific_recipients = json.loads(thresholds.get("specific_recipients", '[]'))
        except (json.JSONDecodeError, TypeError):
            channels = ["in-app"]
            recipient_roles = ["inventory_manager"]
            specific_recipients = []

        current_pct = (balances["available_qty"] / balances["total_qty"]) * 100
        
        alert_type = None
        message = ""

        if current_pct <= low_stock_pct:
            alert_type = "LOW_STOCK"
            message = (
                f"Alert: Item '{item.name}' ({item.item_id}) is at {current_pct:.1f}% capacity "
                f"({format_quantity(balances['available_qty'])}/{format_quantity(balances['total_qty'])}). Low stock threshold is {low_stock_pct}%."
            )
        elif current_pct >= overstock_pct:
            alert_type = "OVERSTOCK"
            message = (
                f"Warning: Item '{item.name}' ({item.item_id}) is at {current_pct:.1f}% capacity "
                f"({format_quantity(balances['available_qty'])}/{format_quantity(balances['total_qty'])}). Overstock threshold is {overstock_pct}%."
            )

        if alert_type:
            # Prepare context for HTML template
            context = {
                "item_name": item.name,
                "item_id": item.item_id,
                "available_qty": balances["available_qty"],
                "total_qty": balances["total_qty"],
                "threshold_pct": low_stock_pct if alert_type == "LOW_STOCK" else overstock_pct,
                "current_pct": current_pct
            }
            self.trigger_notifications(session, channels, recipient_roles, alert_type, message, specific_recipients, context)

    def trigger_notifications(self, session: Session, channels: list[str], roles: list[str], alert_type: str, message: str, specific_recipients: list[dict] = None, context: dict[str, Any] = None):
        """
        Trigger multi-channel notifications.
        """
        # 1. Find system recipients based on roles
        users = session.exec(select(User).where(User.role.in_(roles), User.is_deleted.is_(False))).all()
        user_emails = [u.email for u in users if u.email]
        user_ids = [u.user_id for u in users]
        
        # 2. Add specific recipients
        specific_labels = []
        recipient_emails = list(user_emails)
        if specific_recipients:
            for rec in specific_recipients:
                label = f"{rec.get('name')} ({rec.get('email')})"
                specific_labels.append(label)
                if rec.get('email'):
                    recipient_emails.append(rec.get('email'))

        # Log the trigger
        logger.info(
            "Triggering inventory alert type=%s channels=%s system_recipients=%s external_recipients=%s message=%s",
            alert_type,
            ",".join(channels),
            ",".join(user_ids),
            ",".join(specific_labels),
            message,
        )

        # 3. Handle Email Channel
        if "email" in channels:
            from utils.email_templates import get_inventory_alert_html
            
            # Use specific subject for alerts
            subject = f"PowerGold [{alert_type.replace('_', ' ')}] - {context.get('item_name') if context else 'Inventory Alert'}"
            
            # Generate HTML body if context is provided
            html_body = None
            if context:
                html_body = get_inventory_alert_html(
                    alert_type=alert_type,
                    **context
                )
            
            # Deduplicate emails
            unique_emails = list(set(recipient_emails))
            
            # Send emails in background threads to avoid hanging the API
            def send_emails_task(emails, subject, message, html_body):
                for email in emails:
                    send_email(
                        to_email=email,
                        subject=subject,
                        body=message,
                        html_body=html_body
                    )
            
            thread = threading.Thread(
                target=send_emails_task, 
                args=(unique_emails, subject, message, html_body),
                daemon=True
            )
            thread.start()
            logger.info("Email delivery started in a background thread for %d recipients", len(unique_emails))

alert_service = AlertService()
