"""The three kinds of things the simulator keeps track of."""

from dataclasses import dataclass, field


@dataclass
class Player:
    rank: int
    name: str
    position: str
    college: str


@dataclass
class Team:
    name: str
    needs: list = field(default_factory=list)
    picks: list = field(default_factory=list)
    scores: list = field(default_factory=list)


@dataclass
class Pick:
    round: int
    number: int
    team: str
    from_team: str = ""
