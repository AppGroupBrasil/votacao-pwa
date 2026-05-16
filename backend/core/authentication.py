from django.conf import settings
from rest_framework_simplejwt.authentication import JWTAuthentication


ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"


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


class CookieJWTAuthentication(JWTAuthentication):
    """Lê access token do cookie HttpOnly; cai pro header Authorization se ausente."""

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
        validated_token = self.get_validated_token(raw_token)
        return self.get_user(validated_token), validated_token
