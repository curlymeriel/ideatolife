# Asset Management & AI Reference Rules

AI가 자산을 다루고 참조 이미지를 분석할 때 반드시 준수해야 하는 핵심 규칙입니다.

## 1. 이미지 상태 및 우선순위 (Image State & Priority)

시스템 내부 필드에 따른 데이터 우선순위를 엄격히 준수한다.

- **`referenceImage` (원본)**: 최우선 참조 데이터.
- **`masterImage` (확정본)**: 사용자가 선택한 최종 정답(Ground Truth). `referenceImage`가 없을 경우 최우선순위가 된다.
- **`draftImage` (후보군)**: 가장 낮은 우선순위. 절대 `masterImage`나 `referenceImage`의 분석 결과를 오염시켜서는 안 된다.

## 2. 3단계 참조 앵커링 (3-Step Reference Anchoring)

참조 자산의 추가/삭제/순서 변경에도 일관성을 유지하기 위해 다음 시스템을 따른다.

1. **UI Display**: 사용자에게는 `#1`, `#2` 번호로 식별성을 제공한다.
2. **AI Concept (Prompting)**: 프롬프트 확장 시에는 반드시 **이름 기반 앵커** `(Ref: Name)`를 사용한다. (번호 기반 사용 금지)
3. **API Bridge (Generation)**: 실제 이미지 생성 직전에 시스템이 자동으로 인덱스 번호 `(Reference #N)`로 치환한다. 이때 **인물(Character) 자산을 항상 최상단(IMAGE_1)**에 배치한다.

## 3. 참조 통합 원칙 (Unified Reference Principle)

다음 경로를 통해 '참조 리스트(Tagged References)'에 포함된 모든 이미지는 출처와 상관없이 해당 세션의 **절대적 정답(Reference)**으로 간주한다.

- 외부 업로드 이미지
- 프로젝트 내 타 단계의 Master Image (Key Visuals)
- 과거 생성된 컷(Past Cuts)의 결과물
- 현재 세션에서 '+' 버튼으로 격상된 Draft

## 4. 시각적 분석 우선순위 (Fact Check & Override)

- **GROUND TRUTH**: 텍스트 프롬프트와 참조 이미지의 분석 결과(Inventory)가 충돌할 경우, **무조건 이미지 분석 데이터를 우선**한다.
- AI는 프롬프트에 적힌 오답(예: 잘못된 머리 길이, 의상 색상)을 이미지에 기반하여 강제로 교정(Override)해야 한다.

## 5. 속성별 태그 활용 (Attribute-based Tagging)

각 참조 이미지에 부여된 태그를 바탕으로 분석 가중치를 조절한다.

- `face`, `hair`, `costume`: 인물 정체성 및 외형 유지.
- `style`, `color`: 전체적인 비주얼 톤 및 아트워크 스타일 유지.
- `composition`: 화면 구도 및 공간 레이아웃 참조.
- `character-`, `location-`, `prop-`: 특정 개체의 고유 특징 참조.
