"""
六道众生 - 肉鸽棋类大游戏核心模块
"""

from .state import SamsaraState, samsara_state
from .karma import KarmaSystem
from .detection import DetectionSystem
from .bosses import BossManager, boss_manager
from .skills import SkillTree
from .progression import ProgressionSystem
from .levels import LevelManager, level_manager
from .objectives import ObjectiveEngine, objective_engine
from .turn_limit import TurnLimitSystem
from .karma_assessor import KarmaAssessor, karma_assessor

__all__ = [
    "SamsaraState",
    "samsara_state",
    "KarmaSystem",
    "DetectionSystem",
    "BossManager",
    "boss_manager",
    "SkillTree",
    "ProgressionSystem",
    "LevelManager",
    "level_manager",
    "ObjectiveEngine",
    "objective_engine",
    "TurnLimitSystem",
    "KarmaAssessor",
    "karma_assessor",
]