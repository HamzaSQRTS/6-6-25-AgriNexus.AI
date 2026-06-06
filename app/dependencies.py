from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from app.config import settings
from app.db.mongodb import db_instance, get_db
from app.models.user import TokenData, UserOut, UserRole
from motor.motor_asyncio import AsyncIOMotorDatabase

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")


def _synthetic_user_out(email: str) -> UserOut:
    """Used when DB is unavailable or (mock DB) user row was lost after server restart."""
    role = UserRole.ADMIN if email.lower() == "admin@agrinexus.com" else UserRole.FARMER
    return UserOut(
        _id="session",
        email=email,
        full_name=email.split("@")[0].replace(".", " ").title(),
        role=role,
        is_active=True,
    )


async def get_current_user(
    db: AsyncIOMotorDatabase = Depends(get_db),
    token: str = Depends(oauth2_scheme),
) -> UserOut:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired session. Please log in again.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = TokenData(email=email)
    except JWTError:
        raise credentials_exception

    if db is None:
        return _synthetic_user_out(token_data.email)

    user = await db.users.find_one({"email": token_data.email})
    if user is None:
        # In-memory mock DB loses registrations on restart; JWT may still be valid.
        if db_instance.is_mock:
            return _synthetic_user_out(token_data.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account not found. Please register or log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user["_id"] = str(user["_id"])
    return UserOut(**user)


def check_admin(user: UserOut = Depends(get_current_user)):
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user doesn't have enough privileges",
        )
    return user
