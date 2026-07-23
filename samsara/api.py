"""
轮回系统 API 路由 - 提供轮回相关的 REST API
"""
from fastapi import APIRouter, HTTPException
from typing import Dict, Any

from .state import samsara_state
from .karma import KarmaSystem
from .detection import DetectionSystem
from .bosses import boss_manager
from .skills import SkillTree
from .progression import ProgressionSystem
from .levels import level_manager
from .objectives import objective_engine
from .turn_limit import TurnLimitSystem
from .karma_assessor import karma_assessor

router = APIRouter(prefix="/samsara", tags=["samsara"])

skill_tree = SkillTree(samsara_state)
progression = ProgressionSystem(samsara_state, skill_tree)
karma_system = KarmaSystem(samsara_state)
detection_system = DetectionSystem(samsara_state)
turn_limit_system = TurnLimitSystem(level_manager)

level_manager.state_manager = samsara_state
skill_tree.state_manager = samsara_state


@router.get("/state")
def get_samsara_state() -> Dict[str, Any]:
    """获取轮回元状态"""
    return samsara_state.get_state()


@router.get("/karma")
def get_karma_state() -> Dict[str, Any]:
    """获取业力状态"""
    return karma_system.get_state()


@router.get("/detection")
def get_detection_probability() -> Dict[str, float]:
    """获取识破概率"""
    return {"detection_probability": detection_system.get_current_probability()}


@router.get("/boss")
def get_current_boss(realm: str = None) -> Dict[str, Any]:
    """获取当前道的 Boss"""
    if realm is None:
        realm = samsara_state.get_state()["current_realm"]

    boss = boss_manager.get_boss_by_realm(realm)
    if not boss:
        raise HTTPException(status_code=404, detail="Boss not found")

    return {
        "id": boss.id,
        "name": boss.name,
        "title": boss.title,
        "realm": boss.realm,
        "description": boss.description,
        "initial_detection_probability": boss.initial_detection_probability,
        "karma_multiplier": boss.karma_multiplier,
        "skills": [
            {
                "id": skill.id,
                "name": skill.name,
                "description": skill.description,
                "trigger_type": skill.trigger_type,
                "effect_type": skill.effect_type,
            }
            for skill in boss.skills
        ],
    }


@router.get("/skills")
def get_all_skills() -> Dict[str, Any]:
    """获取所有技能"""
    skills = []
    for skill in skill_tree.get_all_skills():
        state = samsara_state.get_state()
        is_unlocked = skill.id in state["unlocked_skills"]
        can_unlock = skill_tree.can_unlock_skill(skill.id)

        skills.append({
            "id": skill.id,
            "name": skill.name,
            "description": skill.description,
            "branch": skill.branch,
            "level": skill.level,
            "cost": skill.cost,
            "prerequisites": skill.prerequisites,
            "effect_type": skill.effect_type,
            "effect_value": skill.effect_value,
            "effect_description": skill.effect_description,
            "is_unlocked": is_unlocked,
            "can_unlock": can_unlock,
        })

    return {
        "skills": skills,
        "skill_points": samsara_state.get_state()["skill_points"],
        "unlocked_count": len(samsara_state.get_state()["unlocked_skills"]),
    }


@router.post("/skills/{skill_id}/unlock")
def unlock_skill(skill_id: str) -> Dict[str, Any]:
    """解锁技能"""
    success = skill_tree.unlock_skill(skill_id)
    if not success:
        raise HTTPException(status_code=400, detail="Cannot unlock skill")

    return {
        "success": True,
        "skill_id": skill_id,
        "remaining_skill_points": samsara_state.get_state()["skill_points"],
    }


@router.get("/realm")
def get_realm_info() -> Dict[str, Any]:
    """获取当前道信息"""
    return progression.get_realm_position()


@router.post("/realm/advance")
def advance_realm() -> Dict[str, Any]:
    """升道"""
    success, new_realm = progression.advance_realm()
    if not success:
        raise HTTPException(status_code=400, detail=new_realm)

    return {
        "success": True,
        "new_realm": new_realm,
        "realm_name": samsara_state.REALM_NAMES.get(new_realm, new_realm),
    }


@router.post("/realm/regress")
def regress_realm() -> Dict[str, Any]:
    """降道"""
    success, new_realm = progression.regress_realm()
    if not success:
        raise HTTPException(status_code=400, detail=new_realm)

    return {
        "success": True,
        "new_realm": new_realm,
        "realm_name": samsara_state.REALM_NAMES.get(new_realm, new_realm),
    }


@router.get("/level")
def get_current_level_info() -> Dict[str, Any]:
    """获取当前关卡信息"""
    return level_manager.get_level_summary()


@router.post("/level/start")
def start_level(realm: str = None, level_index: int = None) -> Dict[str, Any]:
    """开始关卡"""
    level = level_manager.start_level(realm, level_index)
    if not level:
        raise HTTPException(status_code=404, detail="Level not found")

    turn_limit_system.initialize(level.turn_limit)
    objective_engine.load_objectives(level.objectives)

    return {
        "success": True,
        "level": level_manager.get_level_summary(),
        "turn_limit": turn_limit_system.get_turn_info(),
    }


@router.post("/level/advance")
def advance_level() -> Dict[str, Any]:
    """进入下一关卡"""
    success, level = level_manager.advance_to_next_level()
    if not success:
        raise HTTPException(status_code=400, detail="No more levels in this realm")

    turn_limit_system.initialize(level.turn_limit)
    objective_engine.load_objectives(level.objectives)

    return {
        "success": True,
        "level": level_manager.get_level_summary(),
    }


@router.get("/turns")
def get_turn_info() -> Dict[str, Any]:
    """获取回合信息"""
    return turn_limit_system.get_turn_info()


@router.post("/turns/player_turn")
def player_turn() -> Dict[str, Any]:
    """玩家回合结束"""
    turn_limit_system.on_player_turn()
    is_timeout, remaining = turn_limit_system.check_timeout()

    if is_timeout:
        return {
            **turn_limit_system.get_turn_info(),
            "game_over": True,
            "reason": "turn_limit_exceeded",
        }

    return turn_limit_system.get_turn_info()


@router.post("/karma/consume")
def consume_karma(amount: int, allow_overdraft: bool = True) -> Dict[str, Any]:
    """消耗业力"""
    actual_cost, is_overdraft, overdraft_amount = karma_system.consume(amount, allow_overdraft)

    if actual_cost == 0:
        raise HTTPException(status_code=400, detail="Insufficient karma")

    is_detected = False
    detection_delta = 0.0

    if is_overdraft and overdraft_amount > 0:
        is_detected, detection_delta = detection_system.apply_overdraft_penalty(overdraft_amount)

    samsara_state.increment_cheat_count()

    return {
        "success": True,
        "cost": actual_cost,
        "is_overdraft": is_overdraft,
        "overdraft_amount": overdraft_amount,
        "is_detected": is_detected,
        "detection_increase": detection_delta,
        "new_detection_probability": detection_system.get_current_probability(),
        "new_karma": karma_system.get_state()["current_karma"],
    }


@router.post("/karma/recover")
def recover_karma(game_type: str, event_type: str, event_data: dict = None) -> Dict[str, Any]:
    """根据事件回复业力"""
    amount = karma_system.recover(game_type, event_type, event_data)
    return {
        "success": True,
        "recovered": amount,
        "new_karma": karma_system.get_state()["current_karma"],
    }


@router.post("/karma/refund")
def refund_karma(amount: int) -> Dict[str, Any]:
    """退还业力"""
    karma_system.refund(amount)
    return {
        "success": True,
        "new_karma": karma_system.get_state()["current_karma"],
    }


@router.post("/cheat/assess")
def assess_cheat(command: str, game_type: str = None) -> Dict[str, Any]:
    """评估作弊指令的业力消耗"""
    assessment = karma_assessor.get_assessment(command, game_type)
    return {
        "assessment": assessment,
        "can_afford": assessment["cost"] <= karma_system.get_state()["current_karma"],
        "current_karma": karma_system.get_state()["current_karma"],
    }


@router.get("/progress")
def get_progress() -> Dict[str, Any]:
    """获取整体进度"""
    return progression.get_progression_summary()


@router.post("/reset")
def reset_samsara() -> Dict[str, Any]:
    """重置轮回（新游戏）"""
    samsara_state.reset_all()
    return {"success": True}


@router.post("/new_game_plus")
def new_game_plus() -> Dict[str, Any]:
    """进入 New Game+"""
    progression.start_new_game_plus()
    return {
        "success": True,
        "new_game_plus": samsara_state.get_state()["new_game_plus"],
        "remaining_skill_points": samsara_state.get_state()["skill_points"],
    }