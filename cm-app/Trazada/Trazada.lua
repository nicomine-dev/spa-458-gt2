-- Trazada · app de CSP para Assetto Corsa
--
-- Muestra la trazada de referencia coloreada por pedales (verde acelera, gris suelta, rojo frena,
-- con intensidad según cuánto pisa), tu auto en el mapa, marcha, velocidad y los metros que faltan
-- para la próxima curva. Los datos de cada pista salen de tools/build_app.js y viven en
-- data/<pista>.json (o data/<pista>-<layout>.json). Si la pista no tiene archivo, la app lo avisa.

local car = ac.getCar(0)

local cfg = ac.storage({
  mode = 'human',    -- referencia: 'human' o 'theory'
  follow = true,     -- true: sigue al auto con zoom · false: pista completa
  headingUp = true,  -- con "seguir", el mapa gira para que el auto siempre vaya hacia arriba
  span = 300,        -- metros que entran a lo ancho del mapa cuando sigue al auto
  strip = true,      -- franja con los próximos 300 m
  opacity = 0.9,     -- opacidad del fondo de la caja (0 = transparente)
  line = true,        -- trazada dibujada sobre la pista
  lineMode = 'theory', -- qué referencia se dibuja en la pista
  lineWidth = 0.9,    -- metros de ancho de la cinta
  lineAhead = 300,    -- metros hacia adelante que se dibujan
  lineAlpha = 0.75,   -- opacidad de la cinta
  brakeBars = true,   -- barra roja cruzada en cada punto de frenada
})

-- el fondo propio de la ventana de CSP queda transparente: la caja la dibuja la app con la opacidad elegida
ac.setWindowBackground('main', rgbm(0, 0, 0, 0))

-- ---------- colores (los mismos tokens que la página) ----------
local C = {
  bg = rgbm(0.051, 0.059, 0.071, 0.9),
  panel = rgbm(0.078, 0.09, 0.11, 0.95),
  line = rgbm(0.149, 0.169, 0.2, 1),
  fg = rgbm(0.91, 0.918, 0.929, 1),
  muted = rgbm(0.545, 0.576, 0.616, 1),
  faint = rgbm(0.357, 0.384, 0.424, 1),
  asphalt = rgbm(0.2, 0.22, 0.25, 1),
  accent = rgbm(0.965, 0.788, 0.055, 1),
  dark = rgbm(0.051, 0.059, 0.071, 1),
  brake = rgbm(1, 0.169, 0.169, 1),
  green = rgbm(0.235, 0.941, 0.431, 1),
  edge = rgbm(0.86, 0.88, 0.9, 0.8),
  kerbRed = rgbm(0.82, 0.16, 0.16, 1),
  kerbWhite = rgbm(0.94, 0.94, 0.94, 1),
}
local LEVELS = 12
local PAL = { [0] = rgbm(154 / 255, 160 / 255, 168 / 255, 1) }
local function mix(a, b, t)
  return rgbm((a[1] + (b[1] - a[1]) * t) / 255, (a[2] + (b[2] - a[2]) * t) / 255, (a[3] + (b[3] - a[3]) * t) / 255, 1)
end
for q = 0, LEVELS do
  PAL[1 + q] = mix({ 28, 74, 42 }, { 60, 240, 110 }, q / LEVELS)   -- acelera
  PAL[14 + q] = mix({ 86, 26, 28 }, { 255, 43, 43 }, q / LEVELS)   -- frena
end
-- thr y brk en 0..100 → índice de color
local function pedalCode(thr, brk)
  if brk > 2 then return 14 + math.floor(math.min(brk, 100) / 100 * LEVELS + 0.5) end
  if thr > 3 then return 1 + math.floor(math.min(thr, 100) / 100 * LEVELS + 0.5) end
  return 0
end

local FONT_NUM = 'Bahnschrift:@System;Weight=SemiBold'
local FONT_TXT = 'Segoe UI:@System'
local FONT_BOLD = 'Segoe UI:@System;Weight=Bold'

-- ---------- datos de la pista ----------
local D, loadError, dataName
local N, S, X, Z = 0, nil, nil, nil

local function loadData()
  local id = ac.getTrackID()
  local layout = ac.getTrackLayout() or ''
  dataName = layout ~= '' and (id .. '-' .. layout) or id
  local raw = io.load(ac.dirname() .. '/data/' .. dataName .. '.json')
  if not raw then
    loadError = 'No hay datos para «' .. dataName .. '».\nGeneralos con tools/export.py y tools/build_app.js.'
    return
  end
  local d = JSON.parse(raw)
  if type(d) ~= 'table' or type(d.s) ~= 'table' or not d.theory or not d.human then
    loadError = 'El archivo de «' .. dataName .. '» no se pudo leer.'
    return
  end
  D, N, S, X, Z = d, #d.s, d.s, d.x, d.z
  for _, m in ipairs({ 'theory', 'human' }) do
    local r, codes = d[m], {}
    for i = 1, N do codes[i] = pedalCode(r.thr[i], r.brk[i]) end
    r.code = codes
  end
end
loadData()

local function wrapD(v)
  local L = D.length
  v = v % L
  if v < 0 then v = v + L end
  return v
end
-- último índice con S[i] <= d
local function idxAt(d)
  local lo, hi = 1, N
  while lo < hi do
    local m = math.floor((lo + hi + 1) / 2)
    if S[m] <= d then lo = m else hi = m - 1 end
  end
  return lo
end
local function refAt(arr, d)
  local i = idxAt(d)
  local j = i < N and i + 1 or 1
  local s1 = i < N and S[j] or D.length
  local f = math.min(math.max((d - S[i]) / math.max(s1 - S[i], 0.01), 0), 1)
  return arr[i] + (arr[j] - arr[i]) * f, i
end

-- ---------- proyección mundo → ventana ----------
local P = { ca = 1, sa = 0, cx = 0, cz = 0, sc = 1, ox = 0, oy = 0 }
local tmp = vec2()
local function rotXZ(x, z, ca, sa) return x * ca - z * sa, x * sa + z * ca end
local function proj(x, z)
  local rx, rz = rotXZ(x, z, P.ca, P.sa)
  return tmp:set(P.ox + (rx - P.cx) * P.sc, P.oy + (rz - P.cz) * P.sc)
end

local fitCache = {}
local function fitFor(angle, w, h)
  local key = string.format('%.4f', angle)
  local b = fitCache[key]
  if not b then
    local ca, sa = math.cos(angle), math.sin(angle)
    b = { x0 = math.huge, x1 = -math.huge, z0 = math.huge, z1 = -math.huge }
    for i = 1, N, 4 do
      local rx, rz = rotXZ(X[i], Z[i], ca, sa)
      b.x0, b.x1 = math.min(b.x0, rx), math.max(b.x1, rx)
      b.z0, b.z1 = math.min(b.z0, rz), math.max(b.z1, rz)
    end
    fitCache[key] = b
  end
  local pad = 18
  return (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, math.min((w - pad * 2) / (b.x1 - b.x0), (h - pad * 2) / (b.z1 - b.z0))
end

local cam = { ang = nil, cx = 0, cz = 0, sc = 1 }
local function angleTo(a, b, k)
  local diff = (b - a + math.pi) % (2 * math.pi) - math.pi
  return a + diff * k
end

-- ---------- curvas ----------
local function cornerState(d)
  local best, bestGap = nil, math.huge
  for _, c in ipairs(D.corners) do
    local inside = wrapD(d - c.turnIn)
    if inside < wrapD(c.apex - c.turnIn) + 40 then return c, 0, true end
    local gap = wrapD(c.turnIn - d)
    if gap < bestGap then best, bestGap = c, gap end
  end
  return best, bestGap, false
end

local function nextAhead(d)
  local best, bestGap = nil, math.huge
  for _, c in ipairs(D.corners) do
    local gap = wrapD(c.turnIn - d)
    if gap > 0 and gap < bestGap then best, bestGap = c, gap end
  end
  return best, bestGap
end

-- ---------- trazada sobre la pista (3D) ----------
-- La cinta sigue la línea AI y se apoya en el asfalto: cada punto se ajusta con un rayo hacia abajo
-- la primera vez que se dibuja. Los colores son los mismos que en el mapa.
local Y3, NX3, NZ3 = nil, nil, nil
local function prepare3D()
  Y3, NX3, NZ3 = {}, {}, {}
  local from, dir, hit = vec3(), vec3(0, -1, 0), vec3()
  for i = 1, N do
    local a, b = i < N and i + 1 or 1, i > 1 and i - 1 or N
    local tx, tz = X[a] - X[b], Z[a] - Z[b]
    local l = math.sqrt(tx * tx + tz * tz)
    if l < 1e-6 then l = 1 end
    NX3[i], NZ3[i] = -tz / l, tx / l
    local y = D.y and D.y[i] or car.position.y
    from:set(X[i], y + 3, Z[i])
    local dist = physics.raycastTrack(from, dir, 8, hit)
    Y3[i] = dist >= 0 and hit.y or y
  end
end

local q3 = { vec3(), vec3(), vec3(), vec3() }
local lineColor = rgbm(1, 1, 1, 1)
local function quad(x1, y1, z1, x2, y2, z2, nx1, nz1, nx2, nz2, half, lift, color)
  render.glSetColor(color)
  render.glBegin(render.GLPrimitiveType.Quads)
  render.glVertex(q3[1]:set(x1 - nx1 * half, y1 + lift, z1 - nz1 * half))
  render.glVertex(q3[2]:set(x2 - nx2 * half, y2 + lift, z2 - nz2 * half))
  render.glVertex(q3[3]:set(x2 + nx2 * half, y2 + lift, z2 + nz2 * half))
  render.glVertex(q3[4]:set(x1 + nx1 * half, y1 + lift, z1 + nz1 * half))
  render.glEnd()
end

function script.draw3D()
  if not D or not cfg.line then return end
  if not Y3 then prepare3D() end
  local ref = D[cfg.lineMode] or D.theory
  local codes = ref.code
  local d = wrapD(car.splinePosition * D.length)
  local i0 = idxAt(wrapD(d - 12))
  local count = (idxAt(wrapD(d + cfg.lineAhead)) - i0) % N
  local half = cfg.lineWidth / 2
  render.setBlendMode(render.BlendMode.AlphaBlend)
  render.setDepthMode(render.DepthMode.ReadOnlyLessEqual)
  render.setCullMode(render.CullMode.None)
  for k = 0, count - 1 do
    local i = (i0 - 1 + k) % N + 1
    local j = i < N and i + 1 or 1
    -- se desvanece al final de lo que se dibuja y justo detrás del auto
    local ahead = wrapD(S[i] - d + 12)
    local fade = math.min(1, ahead / 12, (cfg.lineAhead + 12 - ahead) / 60)
    if fade > 0 then
      local c = PAL[codes[i]]
      lineColor.r, lineColor.g, lineColor.b, lineColor.mult = c.r, c.g, c.b, cfg.lineAlpha * fade
      quad(X[i], Y3[i], Z[i], X[j], Y3[j], Z[j], NX3[i], NZ3[i], NX3[j], NZ3[j], half, 0.04, lineColor)
    end
  end
  -- punto de frenada de cada curva que entra en lo que se dibuja: barra roja de lado a lado de la cinta
  if cfg.brakeBars then
    for _, c in ipairs(D.corners) do
      local r = c[cfg.lineMode] or c.theory
      if r and r.action == 'brake' and r.brakeAt then
        local ahead = wrapD(r.brakeAt - d)
        if ahead < cfg.lineAhead then
          local i = idxAt(r.brakeAt)
          local j = i < N and i + 1 or 1
          lineColor.r, lineColor.g, lineColor.b, lineColor.mult = 1, 0.17, 0.17, math.min(1, cfg.lineAlpha + 0.2)
          quad(X[i], Y3[i], Z[i], X[j], Y3[j], Z[j], NX3[i], NZ3[i], NX3[j], NZ3[j], half * 2.2, 0.05, lineColor)
        end
      end
    end
  end
  render.setDepthMode(render.DepthMode.Normal)
end

-- ---------- dibujo ----------
local function text(str, size, pos, color, font)
  ui.pushDWriteFont(font or FONT_TXT)
  ui.dwriteDrawText(str, size, pos, color)
  ui.popDWriteFont()
end
local function textIn(str, size, p1, p2, hAlign, color, font, wrap)
  ui.pushDWriteFont(font or FONT_TXT)
  ui.dwriteDrawTextClipped(str, size, p1, p2, hAlign, ui.Alignment.Center, wrap == true, color)
  ui.popDWriteFont()
end
local function pill(id, label, p1, w, h, active)
  ui.drawRectFilled(p1, p1 + vec2(w, h), active and C.accent or C.panel, 4)
  textIn(label, 10.5, p1, p1 + vec2(w, h), ui.Alignment.Center, active and C.dark or C.muted, FONT_BOLD)
  ui.setCursor(p1)
  return ui.invisibleButton(id, vec2(w, h))
end

local q1, q2, q3, q4 = vec2(), vec2(), vec2(), vec2()
local function projTo(v, x, z)
  local rx, rz = rotXZ(x, z, P.ca, P.sa)
  return v:set(P.ox + (rx - P.cx) * P.sc, P.oy + (rz - P.cz) * P.sc)
end

local function drawCircuit(i0, count, stride, ref, lineW)
  local wide = D.xl ~= nil and D.width * P.sc >= 5
  if wide then
    -- asfalto con el ancho real: un cuadrilátero por tramo
    for k = 0, count - stride, stride do
      local i, j = (i0 - 1 + k) % N + 1, (i0 - 1 + k + stride) % N + 1
      ui.drawQuadFilled(projTo(q1, D.xl[i], D.zl[i]), projTo(q2, D.xl[j], D.zl[j]),
        projTo(q3, D.xr[j], D.zr[j]), projTo(q4, D.xr[i], D.zr[i]), C.asphalt)
    end
    -- bordes blancos; pianos rojo y blanco donde la curva es cerrada
    local kerbW = math.max(2.5, 1.1 * P.sc)
    for side = 1, 2 do
      local EX, EZ = side == 1 and D.xl or D.xr, side == 1 and D.zl or D.zr
      local bit = side == 1 and 1 or 2
      for k = 0, count - stride, stride do
        local i, j = (i0 - 1 + k) % N + 1, (i0 - 1 + k + stride) % N + 1
        local kb = D.kerb[i]
        local onKerb = kb == 3 or kb == bit
        local col = onKerb and (i % 2 == 0 and C.kerbRed or C.kerbWhite) or C.edge
        ui.drawLine(projTo(q1, EX[i], EZ[i]), projTo(q2, EX[j], EZ[j]), col, onKerb and kerbW or 1.2)
      end
    end
  else
    -- de lejos alcanza con una franja del ancho mínimo visible
    for k = 0, count, stride do
      local i = (i0 - 1 + k) % N + 1
      ui.pathLineTo(proj(X[i], Z[i]))
    end
    ui.pathStroke(C.asphalt, false, math.max(5, D.width * P.sc))
  end
  -- trazada coloreada: un trazo por cada tramo del mismo color
  local codes = ref.code
  local prev = codes[i0]
  ui.pathLineTo(proj(X[i0], Z[i0]))
  for k = stride, count, stride do
    local i = (i0 - 1 + k) % N + 1
    ui.pathLineTo(proj(X[i], Z[i]))
    local c = codes[i]
    if c ~= prev then
      ui.pathStroke(PAL[prev], false, lineW)
      ui.pathLineTo(proj(X[i], Z[i]))
      prev = c
    end
  end
  ui.pathStroke(PAL[prev], false, lineW)
end

local function drawMap(p0, size, d, dt, ref, nextC)
  ui.pushClipRect(p0, p0 + size, true)

  -- cámara: pista completa o siguiendo al auto (con giro según el rumbo)
  local baseAng = math.rad(D.rot or 0)
  local tAng, tcx, tcz, tsc
  local pos = car.position
  if cfg.follow then
    tAng = cfg.headingUp and (-math.pi / 2 - math.atan2(car.look.z, car.look.x)) or baseAng
    tsc = size.x / cfg.span
  else
    tAng = baseAng
    tcx, tcz, tsc = fitFor(baseAng, size.x, size.y)
  end
  local k = 1 - math.exp(-(dt or 0.016) * 7)
  if not cam.ang then cam.ang, cam.sc = tAng, tsc end
  cam.ang = angleTo(cam.ang, tAng, k)
  cam.sc = cam.sc + (tsc - cam.sc) * k
  P.ca, P.sa = math.cos(cam.ang), math.sin(cam.ang)
  if cfg.follow then
    tcx, tcz = rotXZ(pos.x, pos.z, P.ca, P.sa)
    tcz = tcz - size.y * 0.18 / cam.sc   -- el auto un poco más abajo del centro: se ve más lo que viene
  end
  cam.cx = cam.cx + (tcx - cam.cx) * (cfg.follow and 1 or k)
  cam.cz = cam.cz + (tcz - cam.cz) * (cfg.follow and 1 or k)
  P.cx, P.cz, P.sc = cam.cx, cam.cz, cam.sc
  P.ox, P.oy = p0.x + size.x / 2, p0.y + size.y / 2

  if cfg.follow then
    local i0 = idxAt(wrapD(d - cfg.span * 0.8))
    local i1 = idxAt(wrapD(d + cfg.span * 1.6))
    local count = (i1 - i0) % N
    drawCircuit(i0, count, 1, ref, 3)
  else
    drawCircuit(1, N, 2, ref, 2.5)
  end

  -- punto de giro de la próxima curva
  if nextC then
    local ti = idxAt(nextC.turnIn)
    local p = proj(X[ti], Z[ti])
    ui.drawCircleFilled(p, 3.5, C.accent, 12)
  end

  -- el auto: anillo amarillo, relleno con lo que estás haciendo vos con los pedales
  local cp = proj(pos.x, pos.z):clone()
  ui.drawCircleFilled(cp, 11, rgbm(0.965, 0.788, 0.055, 0.18), 20)
  ui.drawCircleFilled(cp, 6.5, PAL[pedalCode(car.gas * 100, car.brake * 100)], 16)
  ui.drawCircle(cp, 6.5, C.accent, 16, 2.2)

  ui.popClipRect()

  -- botones sobre el mapa
  if pill('##mode', cfg.mode == 'human' and 'HUMANA' or 'TEÓRICA', p0 + vec2(8, 8), 74, 20, true) then
    cfg.mode = cfg.mode == 'human' and 'theory' or 'human'
  end
  if pill('##view', cfg.follow and 'SEGUIR' or 'PISTA', p0 + vec2(size.x - 70, 8), 62, 20, false) then
    cfg.follow = not cfg.follow
  end
  local lap = ref.lap
  local note = string.format('ref %d:%06.3f', math.floor(lap / 60), lap % 60)
  if ac.getCarID(0) ~= D.car then note = note .. ' · calculada para ' .. D.carName end
  text(note, 10.5, p0 + vec2(9, size.y - 18), C.faint)
end

local function drawStrip(p0, w, h, d, ref, nextC)
  local AHEAD = 300
  ui.drawRectFilled(p0, p0 + vec2(w, h), C.panel, 3)
  local codes = ref.code
  local i = idxAt(d)
  local covered, guard = 0, 0
  while covered < AHEAD and guard < N do
    guard = guard + 1
    local j = i < N and i + 1 or 1
    local seg = (i < N and S[j] or D.length) - S[i]
    local a = math.max(0, wrapD(S[i] - d))
    if a > AHEAD * 1.5 then a = 0 end
    local x0 = p0.x + math.min(a, AHEAD) / AHEAD * w
    local x1 = p0.x + math.min(a + seg, AHEAD) / AHEAD * w
    if x1 > x0 then ui.drawRectFilled(vec2(x0, p0.y), vec2(x1 + 0.6, p0.y + h), PAL[codes[i]], 0) end
    covered = a + seg
    i = j
  end
  -- carteles y punto de giro de la próxima curva
  if nextC then
    local gap = wrapD(nextC.turnIn - d)
    for _, b in ipairs(D.boards) do
      local at = gap - b
      if at >= 0 and at <= AHEAD and b <= nextC.straight + 10 then
        local x = p0.x + at / AHEAD * w
        ui.drawLine(vec2(x, p0.y - 3), vec2(x, p0.y + h), C.fg, 1)
      end
    end
    if gap <= AHEAD then
      local x = p0.x + gap / AHEAD * w
      ui.drawLine(vec2(x, p0.y - 5), vec2(x, p0.y + h + 2), C.accent, 2)
    end
  end
end

local function fmtDist(m)
  if m >= 1000 then return (string.format('%.1f km', m / 1000):gsub('%.', ',', 1)) end
  return string.format('%d m', math.floor(m + 0.5))
end

function script.windowMain(dt)
  local W = ui.windowSize()
  if not D then
    ui.drawRectFilled(vec2(0, 0), W, C.bg, 6)
    textIn(loadError or 'Cargando…', 13, vec2(14, 0), vec2(W.x - 14, W.y), ui.Alignment.Center, C.muted, nil, true)
    return
  end

  -- opacidad de la caja: fondo y paneles; circuito, trazada y textos quedan sólidos
  C.bg.mult = cfg.opacity
  C.panel.mult = math.min(1, cfg.opacity * 1.06)

  local ref = D[cfg.mode] or D.human
  local d = wrapD(car.splinePosition * D.length)
  local c, gap, inside = cornerState(d)
  local nc, ngap = nextAhead(d)

  local hudH = cfg.strip and 236 or 206
  local mapSize = vec2(W.x, math.max(120, W.y - hudH))
  ui.drawRectFilled(vec2(0, 0), W, C.bg, 6)        -- la caja entera, con la opacidad elegida
  drawMap(vec2(0, 0), mapSize, d, dt, ref, nc)
  ui.drawLine(vec2(0, mapSize.y), vec2(W.x, mapSize.y), C.line, 1)

  local pad = 12
  local cw = W.x - pad * 2
  local y = mapSize.y + 10

  -- 1 · curva actual o próxima
  if c then
    local cr = c[cfg.mode] or c.human
    if inside then
      text(c.name:upper(), 17, vec2(pad, y), C.accent, FONT_NUM)
      textIn(string.format('mín. %d km/h · %dª', cr.vmin, cr.gear), 12, vec2(pad, y), vec2(W.x - pad, y + 22), ui.Alignment.End, C.muted)
    else
      text(c.name:upper(), 17, vec2(pad, y), C.fg, FONT_NUM)
      textIn('giro en ' .. fmtDist(gap), 13, vec2(pad, y), vec2(W.x - pad, y + 22), ui.Alignment.End, gap <= 220 and C.accent or C.muted, FONT_NUM)
    end
  end
  y = y + 28

  -- 2 · frenada de la próxima curva, en grande
  ui.drawRectFilled(vec2(pad, y), vec2(W.x - pad, y + 58), C.panel, 5)
  if nc then
    local r = nc[cfg.mode] or nc.human
    local label, big, bigCol, side, sideCol = '', '', C.fg, '', C.muted
    if r.action == 'brake' and r.brakeAt then
      local before = wrapD(nc.turnIn - r.brakeAt + 30) - 30
      local toBrake = ngap - math.max(before, 0)
      if toBrake > 0 then
        label = 'FRENÁ A'
        big = before > 2 and string.format('%d m', math.floor(before + 0.5)) or 'EL GIRO'
        bigCol = C.fg
        side = 'faltan ' .. fmtDist(toBrake)
        sideCol = toBrake <= 100 and C.accent or C.muted
      else
        label, big, bigCol = 'AHORA', '¡FRENÁ!', C.brake
        side = 'giro en ' .. fmtDist(ngap)
      end
      side = side .. string.format('\nhasta %d km/h · %dª', r.vmin, r.gear)
    elseif r.action == 'lift' then
      label, big, bigCol = 'SIN FRENO', 'LEVANTÁ', PAL[0]
      side = string.format('giro en %s\nhasta %d km/h · %dª', fmtDist(ngap), r.vmin, r.gear)
    else
      label, big, bigCol = 'SIN FRENO', 'A FONDO', C.green
      side = string.format('giro en %s\n%d km/h · %dª', fmtDist(ngap), r.vmin, r.gear)
    end
    text(label .. ' · ' .. nc.name:upper(), 10.5, vec2(pad + 10, y + 6), C.muted, FONT_BOLD)
    text(big, 30, vec2(pad + 9, y + 18), bigCol, FONT_NUM)
    ui.pushDWriteFont(FONT_TXT)
    ui.dwriteDrawTextClipped(side, 11.5, vec2(pad, y + 18), vec2(W.x - pad - 10, y + 54), ui.Alignment.End, ui.Alignment.Center, false, sideCol)
    ui.popDWriteFont()
  end
  y = y + 66

  -- 3 · carteles 200 / 150 / 100 / 50 de la próxima curva: se encienden al pasarlos
  if nc then
    local bgap = 6
    local bw = (cw - bgap * 3) / 4
    local bx = pad
    for _, b in ipairs(D.boards) do
      local exists = b <= nc.straight + 10
      local passed = ngap <= b
      local col = exists and passed and C.accent or C.panel
      ui.drawRectFilled(vec2(bx, y), vec2(bx + bw, y + 20), col, 3)
      if exists and not passed and ngap <= b + 120 then ui.drawRect(vec2(bx, y), vec2(bx + bw, y + 20), C.accent, 3, nil, 1) end
      textIn(tostring(b), 12, vec2(bx, y), vec2(bx + bw, y + 20), ui.Alignment.Center,
        not exists and C.line or passed and C.dark or C.fg, FONT_NUM)
      bx = bx + bw + bgap
    end
  end
  y = y + 28

  -- 4 · velocidad y marcha ideales en este punto
  local refV = refAt(ref.v, d)
  local refG = ref.gear[idxAt(d)]
  text(string.format('%d', math.floor(refV + 0.5)), 40, vec2(pad - 2, y - 4), C.fg, FONT_NUM)
  text('km/h ideal', 11.5, vec2(pad, y + 42), C.muted)
  textIn(string.format('%dª', refG), 40, vec2(W.x - pad - 90, y - 6), vec2(W.x - pad, y + 40), ui.Alignment.End, C.accent, FONT_NUM)
  textIn('marcha ideal', 11.5, vec2(W.x - pad - 120, y + 42), vec2(W.x - pad, y + 56), ui.Alignment.End, C.muted)
  y = y + 62

  -- 5 · próximos 300 m
  if cfg.strip then
    drawStrip(vec2(pad, y + 4), cw, 10, d, ref, nc)
    text('ahora', 9.5, vec2(pad, y + 16), C.faint)
    textIn('300 m', 9.5, vec2(pad, y + 16), vec2(W.x - pad, y + 28), ui.Alignment.End, C.faint)
  end
end

function script.windowSettings()
  ui.text('Referencia')
  if ui.radioButton('Humana (piloto simulado)', cfg.mode == 'human') then cfg.mode = 'human' end
  if ui.radioButton('Teórica (límite físico)', cfg.mode == 'theory') then cfg.mode = 'theory' end
  ui.offsetCursorY(6)
  ui.text('Mapa')
  if ui.checkbox('Seguir al auto', cfg.follow) then cfg.follow = not cfg.follow end
  if ui.checkbox('Girar el mapa con el auto', cfg.headingUp) then cfg.headingUp = not cfg.headingUp end
  cfg.span = ui.slider('##span', cfg.span, 150, 1200, 'Zoom: %.0f m de ancho')
  if ui.checkbox('Franja de los próximos 300 m', cfg.strip) then cfg.strip = not cfg.strip end
  ui.offsetCursorY(6)
  ui.text('Trazada en la pista')
  if ui.checkbox('Dibujar la trazada sobre el asfalto', cfg.line) then cfg.line = not cfg.line end
  if ui.radioButton('Teórica##line', cfg.lineMode == 'theory') then cfg.lineMode = 'theory' end
  ui.sameLine()
  if ui.radioButton('Humana##line', cfg.lineMode == 'human') then cfg.lineMode = 'human' end
  cfg.lineWidth = ui.slider('##lineWidth', cfg.lineWidth, 0.3, 2, 'Ancho: %.1f m')
  cfg.lineAhead = ui.slider('##lineAhead', cfg.lineAhead, 80, 600, 'Hacia adelante: %.0f m')
  cfg.lineAlpha = ui.slider('##lineAlpha', cfg.lineAlpha * 100, 15, 100, 'Opacidad: %.0f %%') / 100
  if ui.checkbox('Barra roja en cada punto de frenada', cfg.brakeBars) then cfg.brakeBars = not cfg.brakeBars end
  ui.textWrapped('Apagá la línea ideal de Assetto Corsa (Ayudas → Línea ideal) para no ver dos.')
  ui.offsetCursorY(6)
  ui.text('Caja')
  cfg.opacity = ui.slider('##opacity', cfg.opacity * 100, 0, 100, 'Opacidad del fondo: %.0f %%') / 100
  if D then
    ui.offsetCursorY(6)
    ui.textWrapped(string.format('Datos: %s · %d curvas · referencia calculada para %s.', dataName, #D.corners, D.carName))
  end
end
