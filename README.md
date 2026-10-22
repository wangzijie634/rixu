# 日序 Daymark

一个将日程安排、常用信息和专注计时放在一起的个人效率工作台。

![日序工作台预览](screenshots/workbench.png)

## 功能

- 按日期和时间管理任务，支持日历、日视图、周视图和任务清单。
- 保存、搜索、分类、收藏和复制常用文字片段。
- 使用 15、25 或 50 分钟专注计时。
- 导入、导出 JSON 数据，导入 Markdown，导出 iCalendar（`.ics`）。
- 切换主题、材质和自定义封面或壁纸。

## 运行

需要 Node.js 22 或更新版本，无需安装第三方运行依赖。

```powershell
npm start
```

然后打开 <http://127.0.0.1:4173>。Windows 用户也可以双击 `启动日序.cmd`。

运行测试：

```powershell
npm test
```

## 数据与隐私

任务和信息片段保存在当前浏览器的本地存储中，不会自动上传或跨设备同步。请使用工作台内的数据管理功能备份或迁移数据。自定义图片保存在 `data/media/`，该目录不会纳入版本控制。

首次打开会显示可编辑的通用示例。应用不需要账户或远程服务。

## 项目结构

- `server.mjs`：本地 HTTP 服务。
- `dist/`：工作台界面及静态资源。
- `lib/`：图片存储逻辑。
- `tests/`：逻辑和服务测试。
- `screenshots/`：README 预览图。

第三方许可信息见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
