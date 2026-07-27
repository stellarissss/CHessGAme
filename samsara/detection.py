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
        if modifiers["mist_fog"] and self.state.get_detection() > 70:
            if random.random() < 0.3:
                return 0.0
        return delta

    def check(self, current_detection: float) -> bool:
        roll = random.random() * 100
        return roll < current_detection

    def handle_overdraft(self, overdraft_amount: float) -> dict:
        if overdraft_amount <= 0:
            return {"detected": False, "delta": 0.0, "current": self.state.get_detection()}
        modifiers = self.state.get_skill_modifiers()
        if modifiers["first_overdraft_skip"]:
            modifiers["first_overdraft_skip"] = False
            return {"detected": False, "delta": 0.0, "current": self.state.get_detection(), "skip": True}
        delta = self.calculate_delta(overdraft_amount)
        if delta <= 0:
            return {"detected": False, "delta": 0.0, "current": self.state.get_detection()}
        self.state.increment_detection(delta)
        self.state.record_overdraft()
        current = self.state.get_detection()
        detected = self.check(current)
        if detected:
            if modifiers["golden_escape"]:
                modifiers["golden_escape"] = False
                self.state.set_detection(current * 0.5)
                return {
                    "detected": False,
                    "delta": delta,
                    "current": current * 0.5,
                    "escaped": True,
                }
            else:
                self.state.reset_on_detection()
                return {
                    "detected": True,
                    "delta": delta,
                    "current": 0.0,
                    "reset": True,
                    "message": "天道识破 · 妄改天规者，罚入轮回",
                }
        return {
            "detected": detected,
            "delta": delta,
            "current": current,
        }