# Migration 프로젝트 개선 - 오류 해결 계획

## 문제 상황
Migration 관련 개선 작업 중 오류 발생

## 예상되는 주요 이슈 (대화 히스토리 기반)

### 1. **Progress 계산 문제**
- **증상**: Migrated 프로젝트의 progress가 제대로 계산되지 않음
- **원인 분석 필요**:
  - Dashboard.tsx의 `cachedProgress` 로직 확인 (라인 268-278)
  - Migration 후 `cachedProgress` 메타데이터가 제대로 업데이트되는지 확인
  - `isStepCompleted` 함수가 migrated 데이터를 올바르게 처리하는지 확인

### 2. **Mock Audio 재생 문제**
- **증상**: 이전에 생성된 오디오 파일이 beep 소리(mock audio)로 재생됨
- **원인 분석 필요**:
  - Step3_Production.tsx의 오디오 재생 로직 확인
  - Migration 후 `audioUrl`이 `idb://` 형식으로 변환되었는지 확인
  - `imageStorage.ts`의 IDB URL 처리 로직 확인

## 해결 계획

### Phase 1: 문제 진단
1. ✅ Dashboard.tsx의 progress 계산 로직 확인
2. ⏳ Step3_Production.tsx의 오디오 처리 로직 확인
3. ⏳ migration.ts의 변환 로직 확인
4. ⏳ imageStorage.ts의 IDB URL 처리 확인
5. ⏳ 브라우저 콘솔에서 실제 오류 메시지 확인

### Phase 2: 문제 수정
**Progress 계산 수정**:
- Migration 후 `cachedProgress` 업데이트 로직 추가
- `isStepCompleted` 함수에서 IDB URL 처리 개선

**Audio 재생 수정**:
- Step3_Production.tsx에서 `idb://` URL을 실제 데이터로 resolve하는 로직 추가
- Audio 재생 전 IDB에서 데이터 로드하는 헬퍼 함수 구현

### Phase 3: 검증
1. Migration 실행 후 progress가 올바르게 표시되는지 확인
2. Migrated 프로젝트의 오디오가 정상 재생되는지 확인
3. 새 프로젝트와 migrated 프로젝트 모두 정상 작동하는지 확인

## 다음 단계
1. 브라우저에서 실제 오류 확인
2. 관련 파일들 상세 분석
3. 수정 사항 구현
4. 테스트 및 검증
