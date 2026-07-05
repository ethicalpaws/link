/**
 * LINK Gateway · 记忆数据路由
 *
 * 职责：暴露 Memory 模块的读写和删除接口供 Admin UI 使用。
 * 让用户的"成长轨迹"可视化，同时允许手动管理。
 */

const { Router } = require('express');
const fs = require('fs');
const path = require('path');

function createMemoryRoutes(storage) {
  const router = Router();

  // ─── 日摘要 ───

  /** 获取日摘要列表（最近 N 天） */
  router.get('/daily-summaries', (req, res) => {
    const days = parseInt(req.query.days) || 7;
    try {
      const summaries = storage.getRecentDailySummaries(days);
      res.json({
        count: summaries.length,
        summaries: summaries.map(s => ({
          date: s.date,
          preview: s.content.slice(0, 80) + (s.content.length > 80 ? '…' : ''),
          content: s.content,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** 获取某一天的日摘要 */
  router.get('/daily-summary/:date', (req, res) => {
    const content = storage.getDailySummary(req.params.date);
    if (!content) return res.status(404).json({ error: '该日期没有摘要' });
    res.json({ date: req.params.date, content });
  });

  /** 删除某一天的日摘要 */
  router.delete('/daily-summary/:date', (req, res) => {
    const file = path.join(storage.dailyDir, `${req.params.date}.md`);
    try {
      if (!fs.existsSync(file)) return res.status(404).json({ error: '该日期没有摘要' });
      fs.unlinkSync(file);
      res.json({ success: true, deleted: req.params.date });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── 周摘要 ───

  /** 获取所有周摘要列表 */
  router.get('/digests', (req, res) => {
    try {
      if (!fs.existsSync(storage.digestDir)) return res.json({ digests: [] });
      const files = fs.readdirSync(storage.digestDir)
        .filter(f => f.endsWith('.md'))
        .sort()
        .reverse();
      const digests = files.map(f => ({
        weekKey: f.slice(0, -3),
        preview: '',  // 下面读内容摘要
      }));
      // 读每个文件的头两行做预览
      for (const d of digests) {
        try {
          const content = fs.readFileSync(path.join(storage.digestDir, `${d.weekKey}.md`), 'utf-8');
          d.preview = content.split('\n').slice(0, 2).join(' ').slice(0, 100);
        } catch (_) { d.preview = ''; }
      }
      res.json({ digests });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** 获取某一周的周摘要 */
  router.get('/digest/:weekKey', (req, res) => {
    const content = storage.getWeeklyDigest(req.params.weekKey);
    if (!content) return res.status(404).json({ error: '该周没有摘要' });
    res.json({ weekKey: req.params.weekKey, content });
  });

  /** 删除某一周的周摘要 */
  router.delete('/digest/:weekKey', (req, res) => {
    const file = path.join(storage.digestDir, `${req.params.weekKey}.md`);
    try {
      if (!fs.existsSync(file)) return res.status(404).json({ error: '该周没有摘要' });
      fs.unlinkSync(file);
      res.json({ success: true, deleted: req.params.weekKey });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── 里程碑 ───

  /** 获取所有里程碑 */
  router.get('/milestones', (req, res) => {
    try {
      const content = storage.getMilestones();
      // 解析里程碑文件为结构化数组
      const entries = [];
      if (content) {
        const lines = content.split('\n');
        let current = null;
        for (const line of lines) {
          const match = line.match(/^- (\S+) · (.+)$/);
          if (match) {
            current = { date: match[1], title: match[2], description: '', id: entries.length };
            entries.push(current);
          } else if (current && line.trim().startsWith('  ')) {
            current.description += line.trim() + ' ';
          }
        }
      }
      res.json({ count: entries.length, milestones: entries });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** 添加一条里程碑 */
  router.put('/milestone', (req, res) => {
    const { title, description } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: '标题不能为空' });
    const entry = { date: new Date().toISOString().slice(0, 10), title: title.trim(), description: (description || '').trim() };
    storage.appendMilestone(entry);
    res.json({ success: true, milestone: entry });
  });

  /** 删除一条里程碑 */
  router.delete('/milestone/:id', (req, res) => {
    try {
      const content = storage.getMilestones();
      if (!content) return res.status(404).json({ error: '没有里程碑' });

      const lines = content.split('\n');
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: '无效的 ID' });

      // 找出所有里程碑的起始行号
      const milestoneLines = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^- \S+ · /)) {
          milestoneLines.push(i);
        }
      }

      if (id >= milestoneLines.length) return res.status(404).json({ error: '未找到该里程碑' });

      const startLine = milestoneLines[id];
      const endLine = id + 1 < milestoneLines.length ? milestoneLines[id + 1] : lines.length;

      const newLines = [...lines.slice(0, startLine), ...lines.slice(endLine)];
      fs.writeFileSync(storage.milestonesFile, newLines.join('\n'), 'utf-8');
      res.json({ success: true, deleted: id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── 归档 ───

  /** 获取归档记录 */
  router.get('/archive', (req, res) => {
    try {
      if (!fs.existsSync(storage.archiveFile)) return res.json({ content: '' });
      const content = fs.readFileSync(storage.archiveFile, 'utf-8');
      res.json({ content });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── 用户计划（阶段计划 + 周计划） ───

  const PLAN_TYPES = ['period', 'weekly', 'monthly', 'quarterly'];
  const planFiles = {};
  for (const t of PLAN_TYPES) {
    planFiles[t] = path.join(storage.dataDir, `${t}.md`);
  }

  function isValidPlanType(type) {
    return PLAN_TYPES.includes(type);
  }

  /** 读取计划文件 */
  function readPlan(type) {
    const file = planFiles[type];
    if (!file) return null;
    try {
      if (!fs.existsSync(file)) return null;
      return fs.readFileSync(file, 'utf-8');
    } catch { return null; }
  }

  /** 写入计划文件（原子写入：tmp + rename） */
  function writePlan(type, content) {
    const file = planFiles[type];
    if (!file) return false;
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, content, 'utf-8');
    fs.renameSync(tmp, file);
    return true;
  }

  /** 删除计划文件 */
  function deletePlan(type) {
    const file = planFiles[type];
    if (!file) return false;
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
      return true;
    } catch { return false; }
  }

  /** 获取计划 */
  router.get('/plan/:type', (req, res) => {
    if (!isValidPlanType(req.params.type)) {
      return res.status(400).json({ error: '不支持的 plan 类型，仅支持 period/weekly/monthly/quarterly' });
    }
    const content = readPlan(req.params.type);
    if (!content) return res.json({ exists: false, content: '' });
    res.json({ exists: true, content });
  });

  /** 设置计划 */
  router.put('/plan/:type', (req, res) => {
    if (!isValidPlanType(req.params.type)) {
      return res.status(400).json({ error: '不支持的 plan 类型，仅支持 period/weekly/monthly/quarterly' });
    }
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: '内容不能为空' });
    try {
      writePlan(req.params.type, content);
      res.json({ success: true, updatedAt: new Date().toISOString() });
    } catch (err) {
      res.status(500).json({ error: '写入失败: ' + err.message });
    }
  });

  /** 删除计划 */
  router.delete('/plan/:type', (req, res) => {
    if (!isValidPlanType(req.params.type)) {
      return res.status(400).json({ error: '不支持的 plan 类型，仅支持 period/weekly/monthly/quarterly' });
    }
    const ok = deletePlan(req.params.type);
    if (!ok) return res.status(500).json({ error: '删除失败' });
    res.json({ success: true });
  });

  /** 获取所有计划的状态 */
  router.get('/plans', (req, res) => {
    const status = {};
    for (const t of PLAN_TYPES) {
      status[t] = !!readPlan(t);
    }
    res.json(status);
  });

  /** 获取记忆系统统计 */
  router.get('/stats', (req, res) => {
    try {
      const dailyCount = fs.existsSync(storage.dailyDir)
        ? fs.readdirSync(storage.dailyDir).filter(f => f.endsWith('.md')).length : 0;
      const digestCount = fs.existsSync(storage.digestDir)
        ? fs.readdirSync(storage.digestDir).filter(f => f.endsWith('.md')).length : 0;
      const milestones = storage.getMilestones();
      const milestoneCount = milestones ? milestones.split('\n').filter(l => l.match(/^- \S+ · /)).length : 0;
      const archiveExists = fs.existsSync(storage.archiveFile);

      res.json({
        dailySummaries: dailyCount,
        weeklyDigests: digestCount,
        milestones: milestoneCount,
        hasArchive: archiveExists,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { createMemoryRoutes };
