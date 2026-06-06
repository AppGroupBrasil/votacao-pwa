from django.urls import path

from .views_otp import otp_send, otp_send_email, otp_verify, otp_verify_email

urlpatterns = [
    path("send/", otp_send, name="otp-send"),
    path("verify/", otp_verify, name="otp-verify"),
    path("send-email/", otp_send_email, name="otp-send-email"),
    path("verify-email/", otp_verify_email, name="otp-verify-email"),
]
