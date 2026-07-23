"""
六道众生 - 肉鸽棋类大游戏主入口
"""
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import router as samsara_router

app = FastAPI(title="六道众生 - 肉鸽棋类大游戏", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(samsara_router)


@app.get("/")
def root():
    """根路由"""
    return {"message": "六道众生 - 肉鸽棋类大游戏", "version": "1.0.0"}


@app.get("/health")
def health_check():
    """健康检查"""
    return {"status": "healthy"}


if __name__ == "__main__":
    uvicorn.run("samsara.main:app", host="0.0.0.0", port=8000, reload=True)