# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## 主桌编排（位次规矩）

主桌单独成组编排，核心规则在 `src/headSeating.ts`：

- **主位朝向**：顶部工具条设置「进门在哪边 / 舞台在哪边」。有舞台时新人面向舞台，无舞台时背对进门；1 号位即主位。
- **位次展开**：1 号新郎、2 号新娘居中，双方父母紧挨新人，证婚人居尊位，其余长辈按辈分（祖辈→父辈→平辈→晚辈）从主位向两侧蛇形排开，男家一侧、女家一侧自动归边，伴郎伴娘坐主位对面近通道位。
- **老人小孩**：宾客勾选「老人/小孩/行动不便」后，自动优先安排到离通道近、起身方便的号位（副桌人少时从通道端起排）。
- **换主桌**：选中任意桌 →「换用此桌为主桌」，原主桌组人员整体迁到新桌按新位置重排，旧桌还原为普通桌；副桌与主桌同组、朝向不变。
- **一桌坐不下**：自动生成「主桌·副桌」并弹窗提醒，副桌保住主位与朝向；扩容重排时副桌人员回流，不丢任何已排好的人（有身份却已安排到其他桌的人不会被强拉）。
- **变动可追溯**：每次重排/手动换位后，座位上显示 `原位→新位` 角标，左下角「位次变动清单」列出谁从哪桌第几位挪到了第几位；可一键清除标记。
- 主桌编排是单条历史命令，支持 Ctrl+Z / Ctrl+Y 整体撤销重做。

算法回归测试：`npm test`（`head-seating.test.ts`）。

## 开发

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
