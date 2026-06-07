from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import settings
from app.db.mongodb import get_db
from app.dependencies import get_current_user
from app.models.user import UserCreate, Token, UserOut, UserRole
from app.utils.security import create_access_token, get_password_hash, verify_password

router = APIRouter()


@router.get("/me", response_model=UserOut)
async def read_me(current_user: UserOut = Depends(get_current_user)):
    """Validate Bearer token and return the current user (useful after page refresh)."""
    return current_user


@router.post("/register", response_model=UserOut)
async def register(user_in: UserCreate, db: AsyncIOMotorDatabase = Depends(get_db)):
    if user_in.role == UserRole.ADMIN:
        raise HTTPException(
            status_code=400,
            detail="Registering as an admin is not allowed.",
        )
    user_exists = await db.users.find_one({"email": user_in.email})
    if user_exists:
        raise HTTPException(
            status_code=400,
            detail="User already registered",
        )

    user_dict = user_in.dict()
    password = user_dict.pop("password")
    user_dict["hashed_password"] = get_password_hash(password)
    from datetime import datetime
    user_dict["created_at"] = datetime.utcnow()

    result = await db.users.insert_one(user_dict)
    user_dict["_id"] = str(result.inserted_id)
    return user_dict


@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    user = await db.users.find_one({"email": form_data.username})
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    access_token = create_access_token(subject=user["email"])
    return {"access_token": access_token, "token_type": "bearer"}
