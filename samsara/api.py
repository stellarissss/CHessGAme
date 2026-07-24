from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from .state import SamsaraState, REALM_NAMES
from .karma import KarmaSystem
from .karma_assessor import KarmaAssessor
from .detection import DetectionSystem
from .bosses import BossSystem
from .skills import SkillSystem
from .progression import ProgressionSystem
from .levels import LevelSystem
from .objectives import ObjectiveSystem
from .turn_limit import TurnLimitSystem

state = SamsaraState()
karma = KarmaSystem(state)
karma_assessor = KarmaAssessor(state)
detection = DetectionSystem(state)
bosses = BossSystem(state)
skills = SkillSystem(state)
progression = ProgressionSystem(state)
levels = LevelSystem(state)
objectives = ObjectiveSystem(state)
turn_limit = TurnLimitSystem(state)

app = FastAPI(title="六道轮回 API", version="1.0.0")


@app.get("/api/state")
async def get_samsara_state():
    return state.get_full_state()


@app.get("/api/karma")
async def get_karma():
    return karma.get_state()


@app.post("/api/karma/recover")
async def recover_karma(request: Request):
    body = await request.json()
    game_type = body.get("game_type", "")
    event_type = body.get("event_type", "")
    event_data = body.get("event_data", {})
    amount = karma.recover(game_type, event_type, event_data)
    return {"success": True, "amount": amount, "karma": karma.get_state(), "state": state.get_full_state()}


@app.post("/api/karma/assess")
async def assess_karma(request: Request):
    body = await request.json()
    game_type = body.get("game_type", "")
    instruction = body.get("instruction", "")
    intent_class = body.get("intent_class", "C")
    board_summary = body.get("board_summary", "")
    amount = await karma_assessor.assess(game_type, instruction, intent_class, board_summary)
    return {"success": True, "estimated_cost": amount}


@app.post("/api/karma/consume")
async def consume_karma(request: Request):
    body = await request.json()
    amount = body.get("amount", 0)
    allow_overdraft = body.get("allow_overdraft", True)
    actual, is_overdraft, overdraft_amount = karma.consume(amount, allow_overdraft)
    if actual == 0:
        return {"success": False, "message": "消耗失败", "state": state.get_full_state()}
    result = {
        "success": True,
        "actual_consumed": actual,
        "is_overdraft": is_overdraft,
        "overdraft_amount": overdraft_amount,
        "karma": karma.get_state(),
        "state": state.get_full_state(),
    }
    if is_overdraft:
        detection_result = detection.handle_overdraft(overdraft_amount)
        result["detection"] = detection_result
    return result


@app.post("/api/karma/event")
async def karma_event(request: Request):
    body = await request.json()
    game_type = body.get("game_type", "")
    event_type = body.get("event_type", "")
    details = body.get("details", {})
    amount = karma.recover(game_type, event_type, details)
    return {"success": True, "amount": amount, "state": state.get_full_state()}


@app.post("/api/karma/refund")
async def refund_karma(request: Request):
    body = await request.json()
    amount = body.get("amount", 0)
    karma.refund(amount)
    return {"success": True, "karma": karma.get_state(), "state": state.get_full_state()}


@app.get("/api/detection")
async def get_detection():
    return {"detection": state.get("detection", 0), "state": state.get_full_state()}


@app.get("/api/skills")
async def get_skills():
    return {
        "skill_points": state.get("skill_points", 0),
        "skill_tree": skills.get_skill_tree(),
        "available": skills.get_available_skills(),
        "state": state.get_full_state(),
    }


@app.get("/api/skills/tree")
async def get_skill_tree():
    return skills.get_skill_tree()


@app.post("/api/skills/unlock")
async def unlock_skill(request: Request):
    body = await request.json()
    skill_id = body.get("skill_id", "")
    tier = body.get("tier", 1)
    success = skills.unlock_skill(skill_id, tier)
    return {"success": success, "skill_points": state.get("skill_points", 0), "state": state.get_full_state()}


@app.get("/api/levels")
async def get_levels():
    return {
        "current_level": levels.get_current_level(),
        "total_levels": levels.get_total_levels(),
        "realms": levels.get_all_realms_progress(),
        "state": state.get_full_state(),
    }


@app.post("/api/levels/start")
async def start_level(request: Request):
    body = await request.json()
    realm = body.get("realm", None)
    level_index = body.get("level_index", None)
    mode = body.get("mode", "level")
    if realm:
        state.set_realm(realm)
    if level_index is not None:
        state.set("current_level", level_index)
    state.reset_level_state()
    state.set_sandbox_mode(mode == "sandbox")
    if mode == "sandbox":
        level = levels.load_sandbox()
    else:
        level = levels.load_level()
    turn_limit.reset(level.get("turn_limit", 40 if level.get("game_type") == "weiqi" else 20))
    bosses.reset_boss_skills()
    return {"success": True, "level": level, "state": state.get_full_state()}


@app.post("/api/levels/advance")
async def advance_level():
    result = levels.advance_to_next_level()
    if result["success"]:
        state.reset_level_state()
        turn_limit.reset(40 if result["new_level"].get("game_type") == "weiqi" else 20)
        bosses.reset_boss_skills()
    result["state"] = state.get_full_state()
    return result


@app.get("/api/objectives")
async def get_objectives():
    level = levels.get_current_level()
    objective = level.get("objective") if level else None
    if not objective:
        objective = {"type": "checkmate"}
    return {"objective": objective, "state": state.get_full_state()}


@app.post("/api/objectives/check")
async def check_objective(request: Request):
    body = await request.json()
    game_state = body.get("game_state", {})
    level = levels.get_current_level()
    objective = level.get("objective") if level else {"type": "checkmate"}
    result = objectives.check(objective, game_state)
    return {"success": True, "objective": objective, "result": result, "state": state.get_full_state()}


@app.post("/api/turn/tick")
async def tick_turn():
    is_over = turn_limit.tick()
    return {
        "success": True,
        "current_turn": state.get("current_turn", 0),
        "remaining_turns": turn_limit.get_remaining(),
        "is_over": is_over,
        "state": state.get_full_state(),
    }


@app.get("/api/turn/status")
async def get_turn_status():
    return {
        "current_turn": state.get("current_turn", 0),
        "turn_limit": state.get("turn_limit", 20),
        "remaining_turns": turn_limit.get_remaining(),
        "state": state.get_full_state(),
    }


@app.post("/api/turn/increment")
async def increment_turn(request: Request):
    body = await request.json()
    game_type = body.get("game_type", "")
    is_over = turn_limit.tick()
    return {
        "success": True,
        "current_turn": state.get("current_turn", 0),
        "remaining_turns": turn_limit.get_remaining(),
        "is_over": is_over,
        "state": state.get_full_state(),
    }


@app.post("/api/turn/reset")
async def reset_turn():
    turn_limit.reset()
    return {"success": True, "state": state.get_full_state()}


@app.get("/api/boss")
async def get_boss():
    return {"boss": bosses.get_current_boss(), "state": state.get_full_state()}


@app.post("/api/boss/trigger")
async def trigger_boss_skill(request: Request):
    body = await request.json()
    cheat_count = body.get("cheat_count", 0)
    result = bosses.trigger_boss_skill(cheat_count)
    result["state"] = state.get_full_state()
    return result


@app.post("/api/progression/resolve")
async def resolve_level(request: Request):
    body = await request.json()
    won = body.get("won", False)
    no_cheat = body.get("no_cheat", False)
    boss_defeated = body.get("boss_defeated", False)
    rewards = progression.resolve_level(won, no_cheat, boss_defeated)
    if won:
        advance_result = progression.advance_realm()
        rewards["realm_advance"] = advance_result
    return {"success": True, "rewards": rewards, "state": state.get_full_state()}


@app.post("/api/progression/retreat")
async def retreat_realm():
    result = progression.retreat_realm()
    result["state"] = state.get_full_state()
    return result


@app.post("/api/cheat/record")
async def record_cheat():
    state.record_cheat()
    cheat_count = state.get("cheat_count", 0)
    boss_result = bosses.trigger_boss_skill(cheat_count)
    return {"success": True, "cheat_count": cheat_count, "boss_trigger": boss_result, "state": state.get_full_state()}


@app.post("/api/reset")
async def reset_samsara():
    state.set("current_realm", "hell")
    state.set("current_level", 0)
    state.reset_level_state()
    return {"success": True, "state": state.get_full_state()}


@app.get("/api/realms")
async def get_realms():
    return [
        {"id": k, "name": v} for k, v in REALM_NAMES.items()
    ]


@app.get("/api/levels/realm/{realm}")
async def get_realm_levels(realm: str):
    result = levels.get_realm_levels(realm)
    if not result:
        return {"success": False, "message": f"未知道: {realm}"}
    result["state"] = state.get_full_state()
    return {"success": True, **result}


@app.post("/api/levels/sandbox")
async def start_sandbox(request: Request):
    body = await request.json()
    realm = body.get("realm", None)
    if realm:
        state.set_realm(realm)
    if not state.is_sandbox_unlocked(state.get("current_realm")):
        return {"success": False, "message": "沙盒模式未解锁，请先通关该道所有关卡"}
    state.reset_level_state()
    state.set_sandbox_mode(True)
    level = levels.load_sandbox()
    turn_limit.reset(level.get("turn_limit", 20))
    bosses.reset_boss_skills()
    return {"success": True, "level": level, "state": state.get_full_state()}


@app.post("/api/detection/reset")
async def reset_on_detection():
    state.reset_on_detection()
    return {"success": True, "message": "天道识破 · 妄改天规者，罚入轮回", "state": state.get_full_state()}