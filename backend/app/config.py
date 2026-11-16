from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False, extra="ignore")

    database_url: str = "postgresql+asyncpg://orders:orders@db:5432/orders"
    redis_url: str = "redis://redis:6379/0"
    secret_key: str
    admin_username: str = "admin"
    admin_password: str
    access_token_minutes: int = 60
    uploads_dir: str = "/data/uploads"
    public_origin: str = "http://localhost:8080"
    allow_insecure_local: bool = False
    qr_token_seconds: int = 1200
    guest_session_seconds: int = 10800
    cors_origins: str = "http://localhost:8080,http://127.0.0.1:8080,http://localhost:5500,http://127.0.0.1:5500"

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
