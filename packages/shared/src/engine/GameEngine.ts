import { GameState, FinalSymbol, FinalSymbolBeats, Player, RoundResult, RoundSelectionInfo, FinalRoundResult } from "../types.js";

export class GameEngine {
  
  // 일반 라운드 판정
  static processRound(
    players: Player[],
    selections: Record<string, number | null>, // playerId -> slot (1-indexed) or null
    slotCount: number,
    consecutiveWipeCount: number,
    roundNumber: number
  ): {
    nextPlayers: Player[];
    result: RoundResult;
    nextState: GameState;
    nextSlotCount: number;
    nextConsecutiveWipeCount: number;
    winnerId: string | null;
  } {
    const alivePlayers = players.filter(p => p.isAlive);
    const alivePlayerIds = new Set(alivePlayers.map(p => p.id));
    
    // 칸별 선택 집계
    const slotChosenCount: Record<number, number> = {};
    const slotChosenBy: Record<number, string[]> = {};
    
    // 1부터 slotCount까지 초기화
    for (let s = 1; s <= slotCount; s++) {
      slotChosenCount[s] = 0;
      slotChosenBy[s] = [];
    }
    
    // 생존 플레이어들의 선택을 집계
    for (const p of alivePlayers) {
      const choice = selections[p.id];
      if (choice !== undefined && choice !== null) {
        // 유효 범위 검증 (1 ~ slotCount)
        if (choice >= 1 && choice <= slotCount) {
          slotChosenCount[choice] = (slotChosenCount[choice] || 0) + 1;
          if (!slotChosenBy[choice]) {
            slotChosenBy[choice] = [];
          }
          slotChosenBy[choice].push(p.id);
        }
      }
    }

    // 각 생존 플레이어의 생존 여부 판정
    const selectionInfos: RoundSelectionInfo[] = [];
    const nextPlayersMap = new Map<string, Player>(players.map(p => [p.id, { ...p }]));
    
    let roundAliveCount = 0;
    
    for (const p of players) {
      if (!p.isAlive) {
        // 이미 탈락한 플레이어는 관전 처리
        selectionInfos.push({
          playerId: p.id,
          nickname: p.nickname,
          slotSelected: null,
          isAliveAfterRound: false
        });
        continue;
      }
      
      const choice = selections[p.id];
      let isAliveAfterRound = false;
      
      if (choice !== undefined && choice !== null && choice >= 1 && choice <= slotCount) {
        const count = slotChosenCount[choice];
        if (count === 1) {
          // 혼자 선택한 경우 생존
          isAliveAfterRound = true;
          roundAliveCount++;
        }
      }
      
      const nextPlayer = nextPlayersMap.get(p.id)!;
      nextPlayer.isAlive = isAliveAfterRound;
      
      selectionInfos.push({
        playerId: p.id,
        nickname: p.nickname,
        slotSelected: choice || null,
        isAliveAfterRound
      });
    }

    const isWipeout = roundAliveCount === 0;
    
    let finalNextPlayers: Player[];
    let finalNextState = GameState.ROUND_RESULT;
    let finalNextSlotCount = slotCount;
    let finalConsecutiveWipeCount = consecutiveWipeCount;
    let winnerId: string | null = null;
    
    if (isWipeout) {
      // 전원 탈락 (무효 처리): 이전 생존자 전원 복구
      finalConsecutiveWipeCount++;
      
      // players 상태 복구 (원래 살아있던 유저들 그대로 생존 유지)
      finalNextPlayers = players.map(p => {
        const originalAlive = alivePlayerIds.has(p.id);
        return {
          ...p,
          isAlive: originalAlive
        };
      });
      
      // 3회 연속 전원 탈락 시 칸 수 1개 추가
      if (finalConsecutiveWipeCount >= 3) {
        finalNextSlotCount = alivePlayers.length + 1;
      } else {
        finalNextSlotCount = alivePlayers.length;
      }
      
      finalNextState = GameState.ROUND_RESULT;
    } else {
      // 정상 생존자 발생
      finalConsecutiveWipeCount = 0; // 초기화
      finalNextPlayers = Array.from(nextPlayersMap.values());
      
      if (roundAliveCount === 1) {
        // 1명 생존 -> 최종 우승
        const winner = finalNextPlayers.find(p => p.isAlive)!;
        winnerId = winner.id;
        finalNextState = GameState.GAME_OVER;
        finalNextSlotCount = 0;
      } else if (roundAliveCount === 2) {
        // 2명 생존 -> 결승전 진입
        finalNextState = GameState.FINAL_DUEL;
        finalNextSlotCount = 0;
      } else {
        // 3명 이상 생존 -> 다음 라운드 준비 (칸 수는 다음 생존자 수와 동일)
        finalNextSlotCount = roundAliveCount;
        finalNextState = GameState.ROUND_RESULT;
      }
    }
    
    const result: RoundResult = {
      roundNumber,
      slotCount,
      selections: selectionInfos,
      aliveCountAfterRound: isWipeout ? alivePlayers.length : roundAliveCount,
      isWipeout
    };
    
    return {
      nextPlayers: finalNextPlayers,
      result,
      nextState: finalNextState,
      nextSlotCount: finalNextSlotCount,
      nextConsecutiveWipeCount: finalConsecutiveWipeCount,
      winnerId
    };
  }

  // 결승전 라운드 판정
  static processFinalDuelRound(
    players: Player[],
    finalSelections: Record<string, FinalSymbol | null>, // playerId -> Symbol or null
    finalRoundNumber: number
  ): {
    nextPlayers: Player[];
    result: FinalRoundResult;
    nextState: GameState;
    winnerId: string | null;
  } {
    // 결승에 진입한 두 명의 플레이어 식별
    const finalPlayers = players.filter(p => p.isAlive);
    if (finalPlayers.length !== 2) {
      throw new Error("결승전은 정확히 2명의 플레이어가 필요합니다.");
    }
    
    const p1 = finalPlayers[0];
    const p2 = finalPlayers[1];
    
    const s1 = finalSelections[p1.id] || null;
    const s2 = finalSelections[p2.id] || null;
    
    let roundWinnerId: string | null = null;
    
    if (s1 && !s2) {
      // P1만 냄 -> P1 승
      roundWinnerId = p1.id;
    } else if (!s1 && s2) {
      // P2만 냄 -> P2 승
      roundWinnerId = p2.id;
    } else if (s1 && s2) {
      if (s1 === s2) {
        // 무승부
        roundWinnerId = null;
      } else if (FinalSymbolBeats[s1] === s2) {
        // s1이 s2를 이김
        roundWinnerId = p1.id;
      } else {
        // s2가 s1을 이김
        roundWinnerId = p2.id;
      }
    }
    
    const nextPlayers = players.map(p => {
      if (p.id === roundWinnerId) {
        return { ...p, score: p.score + 1 };
      }
      return p;
    });
    
    // 점수 업데이트 적용된 인스턴스 확인
    const updatedP1 = nextPlayers.find(p => p.id === p1.id)!;
    const updatedP2 = nextPlayers.find(p => p.id === p2.id)!;
    
    let nextState = GameState.FINAL_DUEL;
    let winnerId: string | null = null;
    
    if (updatedP1.score >= 2) {
      winnerId = updatedP1.id;
      nextState = GameState.GAME_OVER;
    } else if (updatedP2.score >= 2) {
      winnerId = updatedP2.id;
      nextState = GameState.GAME_OVER;
    }
    
    const result: FinalRoundResult = {
      roundNumber: finalRoundNumber,
      p1Selection: s1 || FinalSymbol.SHADOW_CIRCLE,
      p2Selection: s2 || FinalSymbol.SHADOW_CIRCLE,
      winnerId: roundWinnerId
    };
    
    return {
      nextPlayers,
      result,
      nextState,
      winnerId
    };
  }
}
