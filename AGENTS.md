# Agent 开发规范：Phone Web Game (Bun + TS)

本文件定义了 AI Agent 在参与本项目开发时的核心行为准则、技术堆栈约束及测试覆盖标准。

---

## 1. 核心技术栈 (Core Stack)
- **Runtime**: [Bun](https://bun.sh) (必须使用 `bun install` 和 `bun test`)
- **Language**: TypeScript (Strict Mode)
- **Platform**: Mobile Web (移动端优先，考虑触屏交互与视口适配)
- **Testing**: [Playwright](https://playwright.dev) (全量交互模拟)

---

## 2. 编程规范与最佳实践

### 2.1 移动端交互 (Mobile Interaction)
- **触控优先**: 必须处理 `touchstart/touchend` 或使用 `pointerdown/pointerup`。
- **防止缩放**: 确保 UI 组件不触发系统的双击缩放。
- **测试标识**: 所有交互元素（按钮、摇杆、弹窗）必须具备 `data-testid` 属性。
  - *示例*: `<button data-testid="joypad-fire">攻击</button>`

### 2.2 TypeScript 准则
- **类型完备**: 禁止使用 `any`，复杂状态必须定义 `interface`。
- **模块化**: 游戏逻辑（Physics/Logic）必须与渲染层（DOM/Canvas）解耦，以便进行纯逻辑单元测试。

---

## 3. 测试规范 (Testing Standards)

所有功能代码必须同步生成对应的测试文件，未通过测试的代码视为无效交付。

### 3.1 逻辑单元测试 (Logic Unit Test)
- **路径**: `src/**/*.test.ts`
- **执行**: 使用 `bun test`。
- **覆盖点**: 核心算法（得分计算、碰撞检测、状态机转换）。

### 3.2 交互测试 (Playwright E2E)
- **路径**: `tests/e2e/*.spec.ts`
- **强制配置**: 必须模拟移动端环境（如 `iPhone 14` 或 `Pixel 7`）。
- **核心流程**:
  1. **加载测试**: 验证首屏资源及 Canvas 加载成功。
  2. **手势测试**: 模拟 `tap`, `swipe`, `drag` 等操作。
  3. **逻辑闭环**: 例如：点击“开始” -> 游戏状态变更 -> 死亡判定 -> 弹出结算面板。

---

## 4. 交付模板示例

当生成新功能时，请遵循以下结构：

### 4.1 功能实现 (`src/game/player.ts`)
```typescript
export class Player {
  hp: number = 100;
  takeDamage(amount: number) {
    this.hp = Math.max(0, this.hp - amount);
  }
}