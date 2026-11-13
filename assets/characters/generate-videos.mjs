// Video queue runner for one character's action prompts.
//
// It reads action prompts from `<character>/动作提示词.md`, skips clips that
// already exist, then submits `agnes-video-2.5-flash` tasks. Each prompt
// section can declare its own duration:
//
//   ## 睡觉
//   ### start
//   **时长**：8 秒
//   ...
//
// A section without `###` sub-sections is treated as one single clip.
// 参考帧模式由 AIPETS_FRAME_MODE 决定：start / loop / end / both。
//   start —— 只锁首帧（AIPETS_FRAME）
//   loop  —— 首尾都锁该动作 start 视频的尾帧，用于无缝循环
//   end   —— 首帧锁 start 视频尾帧，尾帧锁 AIPETS_FRAME
//   both  —— 首尾都锁 AIPETS_FRAME
//
// Run: node assets/characters/generate-videos.mjs
// 环境变量：优先读脚本目录、角色目录、项目根目录的 .env
//   AGNES_API_KEY     必填
//   AGNES_API_ORIGIN  可选，默认 https://api.agnes-ai.cn
//   AIPETS_FRAME_MODE start（默认）/ loop / end / both
//   AIPETS_FRAME      基础参考图（标准站立、绿幕背景）
//   AIPETS_PROMPT_FILE  可选，相对 .env 所在目录解析
// Stop: Ctrl+C. The state file lets a later run resume.
 
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const scriptDir = import.meta.dirname

// 依次尝试脚本目录、角色目录、项目根目录的 .env，找到第一个就用。
let ENV_DIR = scriptDir
for (const file of [
  path.join(scriptDir, '.env'),
  path.join(scriptDir, '..', '.env'),
  path.join(scriptDir, '..', '..', '..', '.env'),
]) {
  if (existsSync(file)) {
    process.loadEnvFile(file)
    ENV_DIR = path.dirname(file)
    break
  }
}

const API_KEY = process.env.AGNES_API_KEY
if (!API_KEY) {
  console.error('缺少环境变量 AGNES_API_KEY，请在 .env 或系统环境变量中设置。')
  process.exit(1)
}
const API_ORIGIN = process.env.AGNES_API_ORIGIN ?? 'https://api.agnes-ai.cn'
const BASE_URL = `${API_ORIGIN}/v1`
const VIDEO_MODEL = 'agnes-video-2.5-flash'
const IMAGE_MODEL = 'agnes-image-2.5-flash'

const TICK_MS = 20 * 1000
const RUN_MS = 10 * 60 * 60 * 1000
const MAX_IN_FLIGHT = 3
const MAX_ATTEMPTS = 2
const TASK_TIMEOUT_MS = 45 * 60 * 1000

const ASPECT_RATIO = '16:9'
const VIDEO_SIZE = '720P'

/**
 * 参考帧模式：
 * - `start`：只锁首帧，首帧为 AIPETS_FRAME
 * - `loop`：首尾都锁该动作 start 视频的尾帧，保证循环衔接
 * - `end`：首帧锁 start 视频尾帧，尾帧锁 AIPETS_FRAME
 * - `both`：首尾都锁 AIPETS_FRAME
 */
const FRAME_MODE = (process.env.AIPETS_FRAME_MODE ?? 'start').trim().toLowerCase()
if (!['start', 'loop', 'end', 'both'].includes(FRAME_MODE)) {
  console.error(`AIPETS_FRAME_MODE 只能是 start / loop / end / both，当前是 ${FRAME_MODE}`)
  process.exit(1)
}

const characterId = process.env.AIPETS_CHARACTER_ID
const CHARACTER_DIR = process.env.AIPETS_CHARACTER_DIR
  ? path.resolve(ENV_DIR, process.env.AIPETS_CHARACTER_DIR)
  : path.basename(scriptDir) === 'tmp'
    ? path.dirname(scriptDir)
    : path.join(scriptDir, characterId)
const ANIMATION_DIR = path.join(CHARACTER_DIR, 'animations')
const OUTPUT_DIR = path.join(CHARACTER_DIR, 'tmp')
// .env 里的相对路径按 .env 所在目录解析，避免受启动时的工作目录影响。
function resolvePath(value, fallback) {
  return value ? path.resolve(ENV_DIR, value) : fallback
}
const DEFAULT_FRAME = path.join(CHARACTER_DIR, 'memes', '第一帧-绿幕.png')
// start / both 的首帧，以及 end 的尾帧，都用这张基础参考图。
const BASE_FRAME_PATH = resolvePath(process.env.AIPETS_FRAME, DEFAULT_FRAME)
const PROMPT_FILE = resolvePath(process.env.AIPETS_PROMPT_FILE, path.join(CHARACTER_DIR, '动作提示词.md'))
const STATE_PATH = path.join(OUTPUT_DIR, 'state.json')
const LOG_PATH = path.join(OUTPUT_DIR, 'runner.log')

const RATE_LIMIT_BACKOFF_MS = 5 * 60 * 1000

const SKIP_SECTIONS = new Set([
  '角色基准描述',
  '通用前缀',
  '动作清单',
  '动作清单与用途',
  '缺失动作清单',
  '长动作说明',
  '首尾帧子前缀',
  '时长与连续性总表',
  '生成顺序与帧链',
  '生成后登记流程',
])

mkdirSync(OUTPUT_DIR, { recursive: true })

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`
  console.log(line)
  appendFileSync(LOG_PATH, `${line}\n`)
}

function normalizeName(name) {
  return name
    .replace(/\.(webm|mp4)$/i, '')
    .replace(/^点击回应[-－—]?/, '')
    .replace(/\s+/g, '')
    .trim()
}

function splitSections(markdown) {
  const blocks = []
  let current = null
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trimEnd()
    if (line.startsWith('## ')) {
      if (current)
        blocks.push(current)
      current = { title: line.slice(3).trim(), lines: [] }
      continue
    }
    if (current)
      current.lines.push(line)
  }
  if (current)
    blocks.push(current)
  return blocks
}

function blockText(block) {
  return block.lines
    .filter(line => line.trim() !== '---')
    .map(line => line.replace(/^>\s?/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 把 `## 动作` 里的 `### start/loop/end` 拆成子段。 */
function splitSubSections(block) {
  const intro = []
  const subs = []
  let current = null

  for (const line of block.lines) {
    if (line.startsWith('### ')) {
      if (current)
        subs.push(current)
      current = { title: line.slice(4).trim(), lines: [] }
      continue
    }
    if (current)
      current.lines.push(line)
    else
      intro.push(line)
  }

  if (current)
    subs.push(current)

  return { intro, subs }
}

/** 从子段正文里读取“时长：X 秒”。 */
function parseSeconds(text, label) {
  const match = text.match(/(?:\*\*)?时长(?:\*\*)?\s*[：:]\s*(\d+(?:\.\d+)?)\s*(?:秒|s)?/i)
  if (!match)
    throw new Error(`[${label}] 缺少“时长：X 秒”`)

  const seconds = Number(match[1])
  if (!Number.isFinite(seconds) || seconds <= 0)
    throw new Error(`[${label}] 时长必须是正数`)

  return seconds
}

/** 把 start/loop/end 或中文子段名统一成英文。 */
function normalizeSegment(value) {
  const text = value.trim()
  if (/^开始$/.test(text))
    return 'start'
  if (/^循环$/.test(text))
    return 'loop'
  if (/^结束$/.test(text))
    return 'end'
  return text.toLowerCase()
}

/** 读取“首尾帧子前缀”，按子段名分别返回。 */
function readFramePrefixes(blocks) {
  const frameBlock = blocks.find(block => block.title === '首尾帧子前缀')
  const prefixes = {}
  if (!frameBlock)
    return prefixes

  const { subs } = splitSubSections(frameBlock)
  for (const sub of subs) {
    const segment = normalizeSegment(sub.title)
    if (segment !== 'start' && segment !== 'loop' && segment !== 'end')
      continue
    prefixes[segment] = blockText(sub).replace(/\*\*/g, '').trim()
  }

  return prefixes
}

function readPromptSources() {
  const actions = []
  if (!existsSync(PROMPT_FILE))
    return actions

  const blocks = splitSections(readFileSync(PROMPT_FILE, 'utf8'))
  const prefix = blocks.find(block => block.title === '通用前缀')
  const shared = prefix ? blockText(prefix) : ''
  const framePrefixes = readFramePrefixes(blocks)

  for (const block of blocks) {
    const title = block.title
    if (SKIP_SECTIONS.has(title) || title.startsWith('附') || title.startsWith('动作清单'))
      continue

    // `## 睡觉-start（6 秒）`：标题自带分段与时长。
    const titled = /^(.+?)-(start|loop|end)（(\d+(?:\.\d+)?)\s*秒）$/.exec(title)
    if (titled) {
      const body = blockText(block).replace(/\*\*/g, '').trim()
      if (body.length < 30)
        throw new Error(`[${title}] 提示词太短`)

      actions.push({
        name: `${titled[1]}-${titled[2]}`,
        actionName: titled[1],
        segment: titled[2],
        intro: '',
        framePrefix: framePrefixes[titled[2]] ?? '',
        body,
        seconds: Number(titled[3]),
        shared,
      })
      continue
    }

    const actionName = title.replace(/^\d+\s+/, '').trim()
    if (!actionName)
      continue

    const { intro, subs } = splitSubSections(block)
    const introText = blockText({ title, lines: intro }).replace(/\*\*/g, '').trim()

    // 没有子段：整段就是一个普通短片。
    if (subs.length === 0) {
      const body = blockText(block).replace(/\*\*/g, '').trim()
      if (body.length < 30)
        continue

      actions.push({
        name: actionName,
        actionName,
        segment: '',
        intro: '',
        framePrefix: '',
        body,
        seconds: parseSeconds(body, actionName),
        shared,
      })
      continue
    }

    // 有子段：每个子段一张视频，文件名带 start/loop/end 后缀。
    for (const sub of subs) {
      const rawSegment = sub.title.trim()
      if (!/^(start|loop|end|开始|循环|结束)$/i.test(rawSegment))
        throw new Error(`[${actionName}] 未知子段：${rawSegment}（只支持 start / loop / end）`)

      const segment = normalizeSegment(rawSegment)
      const body = blockText(sub).replace(/\*\*/g, '').trim()
      if (body.length < 30)
        throw new Error(`[${actionName}/${segment}] 提示词太短`)

      actions.push({
        name: `${actionName}-${segment}`,
        actionName,
        segment,
        intro: introText,
        framePrefix: framePrefixes[segment] ?? '',
        body,
        seconds: parseSeconds(body, `${actionName}/${segment}`),
        shared,
      })
    }
  }

  return actions
}

function existingClipNames() {
  const names = new Set()
  for (const entry of readdirSync(ANIMATION_DIR)) {
    if (/\.(webm|mp4)$/i.test(entry))
      names.add(normalizeName(entry))
  }
  return names
}

function buildJobs() {
  const actions = readPromptSources()
  const existing = existingClipNames()
  const jobs = []
  const seen = new Set()

  for (const action of actions) {
    const key = normalizeName(action.name)
    if (!key || existing.has(key) || seen.has(key)){
      console.log(`跳过动作：${action.name}（已存在或已处理）`)
      continue
    }
    seen.add(key)

    const fileName = `${action.name.replace(/\s+/g, '')}.mp4`
    if (existsSync(path.join(OUTPUT_DIR, fileName)) && statSync(path.join(OUTPUT_DIR, fileName)).size > 1024)
      continue

    const prompt = [
      action.shared,
      action.framePrefix,
      `动作：${action.actionName}${action.segment ? `｜${action.segment}` : ''}`,
      action.intro,
      action.body,
      `输出规格：${action.seconds} 秒、${ASPECT_RATIO}、纯绿幕背景、无音轨、无字幕、无文字水印。`,
    ].filter(Boolean).join('\n\n')

    jobs.push({
      name: action.name,
      actionName: action.actionName,
      segment: action.segment,
      seconds: action.seconds,
      key,
      fileName,
      prompt,
      status: 'pending',
      attempts: 0,
      videoId: null,
      url: null,
      error: null,
      submittedAt: null,
      finishedAt: null,
    })
  }
  console.log(`共 ${jobs.map(job => job.name).join(', ')} 个动作\n`,)

  return jobs
}

function loadState() {
  if (!existsSync(STATE_PATH))
    return { startedAt: Date.now(), hostedFrames: {}, jobs: {} }
  try {
    const saved = JSON.parse(readFileSync(STATE_PATH, 'utf8'))
    return { ...saved, hostedFrames: saved.hostedFrames ?? {} }
  }
  catch {
    return { startedAt: Date.now(), hostedFrames: {}, jobs: {} }
  }
}

function saveState() {
  const snapshot = {
    startedAt,
    hostedFrames: state.hostedFrames ?? {},
    updatedAt: Date.now(),
    // 保留之前 start / loop / end 各轮的记录，切提示词文件时不丢任务状态。
    jobs: { ...(state.jobs ?? {}) },
  }
  for (const job of jobs) {
    snapshot.jobs[job.key] = {
      name: job.name,
      seconds: job.seconds,
      status: job.status,
      attempts: job.attempts,
      videoId: job.videoId,
      url: job.url,
      error: job.error,
      submittedAt: job.submittedAt,
      finishedAt: job.finishedAt,
      fileName: job.fileName,
    }
  }
  writeFileSync(STATE_PATH, `${JSON.stringify(snapshot, null, 2)}\n`)
}

async function request(pathname, { method = 'GET', body, timeout = 120_000, absolute = false } = {}) {
  const url = absolute ? `${API_ORIGIN}${pathname}` : `${BASE_URL}${pathname}`
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
    })
    const text = await response.text()
    let json = null
    try {
      json = JSON.parse(text)
    }
    catch {
      json = null
    }
    return { status: response.status, json, text }
  }
  catch (error) {
    return { status: 0, json: null, text: String(error) }
  }
}

/** 参考图 data URL 缓存；key 带文件 mtime，换图或重新抽帧后不会复用旧 URL。 */
const dataUrlCache = new Map()

function frameOf(file) {
  const cacheKey = `${file}:${statSync(file).mtimeMs}`
  if (!dataUrlCache.has(cacheKey)) {
    dataUrlCache.set(cacheKey, {
      key: cacheKey,
      dataUrl: `data:image/png;base64,${readFileSync(file).toString('base64')}`,
    })
  }
  return dataUrlCache.get(cacheKey)
}

/** 动作 start 视频路径：只认 tmp 下的绿幕 mp4。 */
function startVideoPath(actionName) {
  const file = path.join(OUTPUT_DIR, `${actionName.replace(/\s+/g, '')}-start.mp4`)
  return existsSync(file) ? file : null
}

/** 抽取 start 视频的最后一帧，缓存成 png；源视频更新后重新抽取。 */
function startLastFramePath(actionName) {
  const video = startVideoPath(actionName)
  if (!video)
    throw new Error(`找不到 start 视频：${actionName}-start.mp4，请先用 start 模式生成`)

  const frame = path.join(OUTPUT_DIR, `${actionName.replace(/\s+/g, '')}-start-last.png`)
  if (existsSync(frame) && statSync(frame).mtimeMs >= statSync(video).mtimeMs)
    return frame

  try {
    execFileSync('ffmpeg', [
      '-v', 'error',
      '-sseof', '-0.1',
      '-i', video,
      '-frames:v', '1',
      '-y', frame,
    ], { stdio: 'pipe' })
  }
  catch (error) {
    const stderr = error && typeof error === 'object' && 'stderr' in error
      ? String(error.stderr ?? '')
      : ''
    throw new Error(`抽取 start 尾帧失败：${video}${stderr ? `\n${stderr.slice(0, 500)}` : ''}`)
  }

  if (!existsSync(frame))
    throw new Error(`抽取 start 尾帧失败：${video}`)
  log(`[${actionName}] 已抽取 start 尾帧 -> ${path.basename(frame)}`)
  return frame
}

/** 当前模式下，某个任务需要使用哪张图作为首帧或尾帧。 */
function frameSource(job, which) {
  if (FRAME_MODE === 'start')
    return which === 'first' ? frameOf(BASE_FRAME_PATH) : null

  if (FRAME_MODE === 'both')
    return frameOf(BASE_FRAME_PATH)

  if (FRAME_MODE === 'loop')
    return frameOf(startLastFramePath(job.actionName))

  // end：首帧接 start 尾帧，尾帧回到基础站姿。
  if (which === 'first')
    return frameOf(startLastFramePath(job.actionName))
  return frameOf(BASE_FRAME_PATH)
}

function frameValue(job, which) {
  const source = frameSource(job, which)
  if (!source)
    return undefined
  return state.hostedFrames?.[source.key] ?? source.dataUrl
}

// Uploads the reference PNG through the image model, so the video service can
// read a public URL. It runs only when a task reports an unreadable frame.
async function ensureHostedFrame(key, source) {
  state.hostedFrames ??= {}
  if (state.hostedFrames[key])
    return state.hostedFrames[key]

  log(`参考帧改用公开地址：先让图片模型转存 ${key}`)
  const prompt = 'Return this exact character reference image unchanged. Keep the pose, the green background, the outfit, and the colors identical.'
  const payloads = [
    { model: IMAGE_MODEL, prompt, size: '1K', ratio: ASPECT_RATIO, image: [source], extra_body: { response_format: 'url' } },
    { model: IMAGE_MODEL, prompt, size: '1K', ratio: ASPECT_RATIO, extra_body: { image: [source], response_format: 'url' } },
  ]

  for (const payload of payloads) {
    const result = await request('/images/generations', { method: 'POST', body: payload, timeout: 180_000 })
    const url = result.json?.data?.[0]?.url
    if (url) {
      state.hostedFrames[key] = url
      saveState()
      log(`参考图已转存：${url}`)
      return url
    }
    log(`转存参考图失败：HTTP ${result.status} ${result.text.slice(0, 200)}`)
  }
  return source
}

function videoIdOf(json) {
  const data = json?.data ?? json ?? {}
  return data.video_id ?? data.videoId ?? data.id ?? data.task_id ?? json?.video_id ?? json?.id ?? null
}

// Returns true when the service accepted the task. A false result means stop
// submitting for now: the queue is full, the rate limit is hit, or the task failed.
async function submit(job) {
  const firstFrame = frameValue(job, 'first')
  const lastFrame = frameValue(job, 'last')
  const frames = {}
  if (firstFrame)
    frames.first_frame = firstFrame
  if (lastFrame)
    frames.last_frame = lastFrame

  const payload = {
    model: VIDEO_MODEL,
    prompt: job.prompt,
    seconds: String(job.seconds),
    // 服务端要求 mode 必填，四种参考帧模式都走 keyframe。
    mode: 'keyframe',
    size: VIDEO_SIZE,
    aspect_ratio: ASPECT_RATIO,
    ...frames,
  }

  const result = await request('/videos', { method: 'POST', body: payload, timeout: 180_000 })
  const code = result.json?.code ?? ''

  if (result.status === 200) {
    const videoId = videoIdOf(result.json)
    if (!videoId) {
      job.error = `建任务成功但没有视频 id：${result.text.slice(0, 160)}`
      job.status = 'failed'
      log(`[${job.name}] ${job.error}`)
      return false
    }
    job.status = 'running'
    job.videoId = videoId
    job.submittedAt = Date.now()
    job.error = null
    log(`[${job.name}] 已建任务 video_id=${videoId}（${job.seconds} 秒）`)
    return true
  }

  if (code === 'video_queue_full' || result.status === 503) {
    log(`[${job.name}] 队列已满，等下一轮：HTTP ${result.status} ${result.text.slice(0, 200)}`)
    return false
  }

  if (result.status === 429 || code === 'rate_limit_exceeded') {
    cooldownUntil = Date.now() + RATE_LIMIT_BACKOFF_MS
    log(`[${job.name}] 触发速率限制，暂停建任务 ${RATE_LIMIT_BACKOFF_MS / 60_000} 分钟`)
    return false
  }

  if (code === 'insufficient_user_quota' || result.status === 403) {
    throw new Error(`账号额度不足：${result.text.slice(0, 160)}`)
  }

  job.attempts += 1
  job.error = `HTTP ${result.status} ${result.text.slice(0, 300)}`
  job.status = job.attempts < MAX_ATTEMPTS ? 'pending' : 'failed'
  if (/图片|image|frame|url|下载|fetch|media/i.test(job.error))
    job.needsHostedFrame = true
  log(`[${job.name}] 建任务失败（第 ${job.attempts} 次）：${job.error}`)
  return false
}

async function poll(job) {
  const query = `/agnesapi?video_id=${encodeURIComponent(job.videoId)}&model_name=${VIDEO_MODEL}`
  const result = await request(query, { timeout: 60_000, absolute: true })
  const json = result.json ?? {}
  const status = json.status ?? ''

  if (status === 'completed' && json.url) {
    const filePath = path.join(OUTPUT_DIR, job.fileName)
    try {
      const response = await fetch(json.url, { signal: AbortSignal.timeout(300_000) })
      if (!response.ok)
        throw new Error(`下载失败 HTTP ${response.status}`)
      const buffer = Buffer.from(await response.arrayBuffer())
      writeFileSync(filePath, buffer)
      job.status = 'done'
      job.url = json.url
      job.finishedAt = Date.now()
      job.error = null
      log(`[${job.name}] 完成，已保存 ${job.fileName}（${(buffer.length / 1024 / 1024).toFixed(2)} MB）`)
    }
    catch (error) {
      job.error = `结果下载失败：${String(error).slice(0, 200)}`
      job.status = job.attempts < MAX_ATTEMPTS ? 'pending' : 'failed'
      log(`[${job.name}] ${job.error}`)
    }
    return
  }

  if (status === 'failed') {
    job.attempts += 1
    job.error = JSON.stringify(json.error ?? json).slice(0, 300)
    job.status = job.attempts < MAX_ATTEMPTS ? 'pending' : 'failed'
    job.videoId = null
    if (/图片|image|frame|url|下载|fetch|media/i.test(job.error))
      job.needsHostedFrame = true
    log(`[${job.name}] 任务失败（第 ${job.attempts} 次）：${job.error}`)
    return
  }

  if (result.status === 404 && Date.now() - (job.submittedAt ?? Date.now()) > 5 * 60 * 1000) {
    job.attempts += 1
    job.error = '任务查询 404'
    job.status = job.attempts < MAX_ATTEMPTS ? 'pending' : 'failed'
    log(`[${job.name}] 任务查询 404，稍后重建`)
    return
  }

  if (Date.now() - (job.submittedAt ?? Date.now()) > TASK_TIMEOUT_MS) {
    job.attempts += 1
    job.error = '任务超时'
    job.status = job.attempts < MAX_ATTEMPTS ? 'pending' : 'failed'
    log(`[${job.name}] 任务超时，稍后重建`)
    return
  }

  log(`[${job.name}] 生成中 ${status || 'pending'} ${json.progress ?? 0}%`)
}

const state = loadState()
if (!existsSync(PROMPT_FILE))
  throw new Error(`找不到提示词文件：${PROMPT_FILE}`)
if (!existsSync(BASE_FRAME_PATH))
  throw new Error(`找不到参考图：${BASE_FRAME_PATH}`)
const jobs = buildJobs()

// loop / end 需要复用每条动作的 start 尾帧，缺视频时直接停下并列出清单。
if (FRAME_MODE === 'loop' || FRAME_MODE === 'end') {
  const missing = [...new Set(jobs.map(job => job.actionName))]
    .filter(name => !startVideoPath(name))
  if (missing.length)
    throw new Error(`以下动作缺少 start 视频，无法生成 ${FRAME_MODE} 段：\n${missing.join('\n')}`)
}

const saved = state.jobs ?? {}
for (const job of jobs) {
  const previous = saved[job.key]
  if (!previous)
    continue
  job.attempts = previous.attempts ?? 0
  if (previous.status === 'done' && existsSync(path.join(OUTPUT_DIR, job.fileName))) {
    job.status = 'done'
    job.url = previous.url ?? null
    job.finishedAt = previous.finishedAt ?? null
  }
  else if (previous.status === 'running' && previous.videoId) {
    job.status = 'running'
    job.videoId = previous.videoId
    job.submittedAt = previous.submittedAt ?? Date.now()
  }
}
state.hostedFrames ??= {}

let startedAt = state.startedAt ?? Date.now()
let deadline = startedAt + RUN_MS
let cooldownUntil = 0

function running() {
  return jobs.filter(job => job.status === 'running')
}

function pending() {
  return jobs.filter(job => job.status === 'pending')
}

function summary() {
  const done = jobs.filter(job => job.status === 'done').length
  const failed = jobs.filter(job => job.status === 'failed').length
  return `完成 ${done}/${jobs.length}，失败 ${failed}，待办 ${pending().length}，生成中 ${running().length}`
}

function resetStartedAtIfStale() {
  // A resumed run continues its ten hour window. A finished run starts fresh.
  if (Date.now() > deadline) {
    startedAt = Date.now()
    deadline = startedAt + RUN_MS
    state.startedAt = startedAt
  }
}

resetStartedAtIfStale()

log(`启动：${jobs.length} 个待生成分镜，目标目录 ${OUTPUT_DIR}`) 
log(`节奏 ${TICK_MS / 1000} 秒一次，并行 ${MAX_IN_FLIGHT}，时长 ${RUN_MS / 3_600_000} 小时`)
log(`提示词 ${PROMPT_FILE}`)
log(`参考图 ${BASE_FRAME_PATH}`)
log(`参考帧模式 ${FRAME_MODE}`)
if (FRAME_MODE === 'loop' || FRAME_MODE === 'end')
  log(`start 尾帧来源：${path.join(OUTPUT_DIR, '<动作名>-start.mp4')}`)
log(`初始状态：${summary()}`)

for (const job of jobs)
  if (job.status === 'pending')
    log(`待生成：${job.name}（${job.seconds} 秒）-> ${job.fileName}`)

let stopping = false
process.on('SIGINT', () => {
  stopping = true
  log('收到中断信号，保存状态后退出')
  saveState()
  process.exit(0)
})

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

if (process.env.DRY_RUN === '1') {
  for (const job of jobs) {
    const first = frameSource(job, 'first')
    const last = frameSource(job, 'last')
    log(`${job.status}\t${job.name}\t${job.seconds} 秒\t${job.fileName}\t首帧 ${first?.key ?? '-'}\t尾帧 ${last?.key ?? '-'}\t提示词 ${job.prompt.length} 字`)
  }
  process.exit(0)
}

while (!stopping && Date.now() < deadline) {
  const tickStart = Date.now()
  log(`--- ${new Date().toLocaleString('zh-CN')} ${summary()}`)

  for (const job of running())
    await poll(job)

  if (!running().length && !pending().length) {
    log('全部动作已结束，提前退出')
    saveState()
    break
  }

  // One attempt every TICK_MS. An accepted task leads straight to the next one.
  let fatal = false
  while (!stopping && Date.now() < deadline && running().length < MAX_IN_FLIGHT) {
    const next = Date.now() < cooldownUntil ? null : pending()[0]
    if (!next)
      break

    try {
      if (next.needsHostedFrame) {
        next.needsHostedFrame = false
        // 首尾帧都可能来自不同图片，逐个转存后再重试。
        for (const which of ['first', 'last']) {
          const source = frameSource(next, which)
          if (source)
            await ensureHostedFrame(source.key, source.dataUrl)
        }
      }

      if (!await submit(next))
        break
    }
    catch (error) {
      log(String(error))
      fatal = true
      break
    }

    saveState()

    if (running().length < MAX_IN_FLIGHT && pending().length)
      await sleep(TICK_MS)
  }

  saveState()

  if (fatal) {
    log('额度不足或不可恢复错误，停止')
    break
  }

  const elapsed = Date.now() - tickStart
  const wait = Math.max(0, TICK_MS - elapsed)
  if (Date.now() + wait >= deadline)
    break
  await sleep(wait)
}

for (const job of running())
  await poll(job)

saveState()
log(`结束：${summary()}`)
log(`产物目录 ${OUTPUT_DIR}`)
