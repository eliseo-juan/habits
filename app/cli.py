"""Admin commands: there is no public sign-up, accounts and tokens are created here."""

import argparse
import getpass
import sys

from app.auth.security import create_api_token
from app.backup import backup_sqlite
from app.clock import utcnow
from app.config import get_settings
from app.db import get_sessionmaker
from app.errors import AppError
from app.services.users import create_user, find_user


def _create_user(args: argparse.Namespace) -> None:
    password = (
        sys.stdin.readline().rstrip("\n") if args.password_stdin else getpass.getpass("Password: ")
    )
    with get_sessionmaker()() as db:
        user = create_user(
            db,
            email=args.email,
            display_name=args.name or args.email.split("@")[0],
            password=password or None,
            timezone=args.timezone or get_settings().default_timezone,
            role="admin" if args.admin else "user",
            now=utcnow(),
        )
        print(f"created user {user.id} <{user.email}>")


def _create_token(args: argparse.Namespace) -> None:
    with get_sessionmaker()() as db:
        user = find_user(db, args.email)
        if user is None:
            raise AppError(f"no user {args.email}")
        _token, plaintext = create_api_token(db, user, args.name, args.scope, utcnow())
        db.commit()
        print(plaintext)


def _backup(_args: argparse.Namespace) -> None:
    settings = get_settings()
    target = backup_sqlite(settings.database_url, settings.backup_dir, utcnow())
    print(target or "nothing to do (already backed up today, or not SQLite)")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="habits")
    commands = parser.add_subparsers(required=True)

    user = commands.add_parser("create-user", help="create an account")
    user.add_argument("email")
    user.add_argument("--name")
    user.add_argument("--timezone")
    user.add_argument("--admin", action="store_true")
    user.add_argument("--password-stdin", action="store_true", help="read the password from stdin")
    user.set_defaults(run=_create_user)

    token = commands.add_parser(
        "create-token", help="create a personal API token and print it once"
    )
    token.add_argument("email")
    token.add_argument(
        "--name", required=True, help="also used as the source of the marks it makes, e.g. awtrix"
    )
    token.add_argument("--scope", choices=["read", "write"], required=True)
    token.set_defaults(run=_create_token)

    backup = commands.add_parser("backup", help="consistent copy of the SQLite database")
    backup.set_defaults(run=_backup)

    args = parser.parse_args(argv)
    try:
        args.run(args)
    except AppError as error:
        print(error.message, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
