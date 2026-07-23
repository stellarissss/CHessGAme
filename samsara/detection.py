import random
from .state import SamsaraState


class DetectionSystem:
    def __init__(self, state: SamsaraState):
        self.state = state

    def calculate_delta(self, overdraft_amount: float) -> float:
        if overdraft_amount <= 0:
            return 0.0
        modifiers = self.state.get_skill_modifiers()
        C = modifiers["detection_coefficient"]
        alpha = modifiers["detection_alpha"]
        delta = C * (overdraft_amount ** alpha)
        if modifiers["mist_fog"] and self.state.get("detection", 0) > 70:
            if random.random() < 0.3:
                return 0.0
        return delta

    def check(self, current_detection: float) -> bool:
        roll = random.random() * 100
        return roll < current_detection

    def handle_overdraft(self, overdraft_amount: float) -> dict:
        if overdraft_amount <= 0:
            return {"detected": False, "delta": 0.0, "current": self.state.get("detection", 0)}
        modifiers = self.state.get_skill_modifiers()
        # 首次透支免判（一次性技能，通过 state 标记追踪）
        if modifiers["first_overdraft_skip"] and not self.state.get("first_overdraft_skip_used", False):
            self.state.set("first_overdraft_skip_used", True)
            return {"detected": False, "delta": 0.0, "current": self.state.get("detection", 0), "skip": True}
        delta = self.calculate_delta(overdraft_amount)
        if delta <= 0:
            return {"detected": False, "delta": 0.0, "current": self.state.get("detection", 0)}
        self.state.increment_detection(delta)
        self.state.record_overdraft()
        current = self.state.get("detection", 0)
        detected = self.check(current)
        if detected:
            # 金蝉脱壳（一次性技能，通过 state 标记追踪）
            if modifiers["golden_escape"] and not self.state.get("golden_escape_used", False):
                self.state.set("golden_escape_used", True)
                new_detection = current * 0.5
                self.state.set_detection(new_detection)
                return {
                    "detected": False,
                    "delta": delta,
                    "current": new_detection,
                    "escaped": True,
                }
        return {
            "detected": detected,
            "delta": delta,
            "current": current,
        }