import os
import jwt as pyjwt
from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework import exceptions


ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"

APP_SLUG = "votacao-online"
STATUS_VALIDOS_LICENCA = {"ativa", "trial"}
CENTRAL_JWT_SECRET = os.getenv("JWT_SECRET", "")


def _cookie_attrs():
    secure = not settings.DEBUG
    return {
        "httponly": True,
        "secure": secure,
        "samesite": "Lax",
        "path": "/",
    }


def set_auth_cookies(response, access: str, refresh: str | None = None):
    attrs = _cookie_attrs()
    access_lifetime = settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"]
    response.set_cookie(
        ACCESS_COOKIE, access,
        max_age=int(access_lifetime.total_seconds()),
        **attrs,
    )
    if refresh:
        refresh_lifetime = settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"]
        response.set_cookie(
            REFRESH_COOKIE, refresh,
            max_age=int(refresh_lifetime.total_seconds()),
            **attrs,
        )
    return response


def clear_auth_cookies(response):
    attrs = _cookie_attrs()
    response.delete_cookie(ACCESS_COOKIE, path=attrs["path"], samesite=attrs["samesite"])
    response.delete_cookie(REFRESH_COOKIE, path=attrs["path"], samesite=attrs["samesite"])
    return response


def _try_central_token(raw_token):
    """Tenta validar como token do auth-central. Retorna (user, payload) ou None."""
    if not CENTRAL_JWT_SECRET:
        return None
    try:
        payload = pyjwt.decode(
            raw_token if isinstance(raw_token, str) else raw_token.decode("utf-8"),
            CENTRAL_JWT_SECRET,
            algorithms=["HS256"],
        )
    except Exception:
        return None
    apps = payload.get("apps")
    if not isinstance(apps, list):
        return None
    licenca = next((a for a in apps if a.get("slug") == APP_SLUG), None)
    if not licenca or licenca.get("status") not in STATUS_VALIDOS_LICENCA:
        raise exceptions.PermissionDenied("Sem licença ativa para Votação Online.")
    expira = licenca.get("expira_em")
    if expira:
        from datetime import datetime
        try:
            if datetime.fromisoformat(expira.replace("Z", "+00:00")) < datetime.now(tz=None).astimezone():
                raise exceptions.PermissionDenied("Licença expirada.")
        except ValueError:
            pass
    User = get_user_model()
    email = payload.get("email")
    if not email:
        raise exceptions.AuthenticationFailed("Token central sem email.")
    user, created = User.objects.get_or_create(
        email=email,
        defaults={
            "username": email,
            "first_name": (payload.get("nome") or email)[:150],
            "is_active": True,
        },
    )
    if created:
        user.set_unusable_password()
        user.save(update_fields=["password"])
    return (user, payload)


class CookieJWTAuthentication(JWTAuthentication):
    """Lê access token do cookie HttpOnly; cai pro header Authorization se ausente.
    Aceita também tokens do auth-central (assinados com JWT_SECRET, com apps[])."""

    def authenticate(self, request):
        header = self.get_header(request)
        raw_token = None
        if header is not None:
            raw_token = self.get_raw_token(header)
        if raw_token is None:
            cookie = request.COOKIES.get(ACCESS_COOKIE)
            if not cookie:
                return None
            raw_token = cookie.encode("utf-8")

        # 1) Tenta token do auth-central
        central = _try_central_token(raw_token)
        if central is not None:
            return central

        # 2) Fallback: JWT local (simplejwt)
        validated_token = self.get_validated_token(raw_token)
        return self.get_user(validated_token), validated_token
