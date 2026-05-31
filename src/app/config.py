from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    ha_url: str
    ha_token: str
    ha_todo_entity: str = "todo.shopping_list"
    ha_notify_service: str
    api_secret: str
    groc_dir: str = "/opt/uk-grocery-cli"
    groc_config_dir: str = "/home/appuser/.sainsburys"
    mealie_url: str | None = None   # e.g. http://mealie.local:9000
    mealie_token: str | None = None

    model_config = {"env_file": ".env"}


settings = Settings()
