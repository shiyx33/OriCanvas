// ============================================================
// 工具系统 — 基础几何 → 选择/擦除 → 绘制/变换 → 饼菜单 → 工具切换
// 原则：被依赖者在前，依赖者在后；同类工具聚合
// ============================================================

// ═══════════════════════════════════════════════
// 1. 基础几何 — 点/线/面判定、交点、垂足、对称
// ═══════════════════════════════════════════════

// 射线法判断点是否在多边形内
function pointInPolygon(p,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const xi=poly[i].x,yi=poly[i].y,xj=poly[j].x,yj=poly[j].y;if((yi>p.y)!==(yj>p.y)&&p.x<(xj-xi)*(p.y-yi)/(yj-yi)+xi)inside=!inside;}return inside;}

// 两线段是否相交（参数形式，不含端点）
function segsIntersect(x1,y1,x2,y2,x3,y3,x4,y4){const d=(x1-x2)*(y3-y4)-(y1-y2)*(x3-x4);if(Math.abs(d)<1e-10)return false;const t=((x1-x3)*(y3-y4)-(y1-y3)*(x3-x4))/d,u=-((x1-x2)*(y1-y3)-(y1-y2)*(x1-x3))/d;return t>=0&&t<=1&&u>=0&&u<=1;}

// 线段是否与轴对齐矩形相交
function lineIntersectsRect(l,rx,ry,rxx,ryy){
  const corners=[[rx,ry],[rxx,ry],[rxx,ryy],[rx,ryy]];
  for(let i=0;i<4;i++){const[x1,y1]=corners[i],[x2,y2]=corners[(i+1)%4];if(segsIntersect(l.a.x,l.a.y,l.b.x,l.b.y,x1,y1,x2,y2))return true;}
  return false;
}

// 两线段交点（严格内部，排除端点）→ [折线] addLineWithSplit 用
function segIntersection(a1,b1,a2,b2){
  const x1=a1.x,y1=a1.y,x2=b1.x,y2=b1.y,x3=a2.x,y3=a2.y,x4=b2.x,y4=b2.y;
  const d=(x1-x2)*(y3-y4)-(y1-y2)*(x3-x4);
  if(Math.abs(d)<1e-10)return null;
  const t=((x1-x3)*(y3-y4)-(y1-y3)*(x3-x4))/d;
  const u=-((x1-x2)*(y1-y3)-(y1-y2)*(x1-x3))/d;
  if(t>0.001&&t<0.999&&u>0.001&&u<0.999)return new Point(x1+t*(x2-x1),y1+t*(y2-y1));
  return null;
}

// 两直线交点（无限延伸）
function lineLineIntersection(la,lb,sa,sb){
  const x1=la.x,y1=la.y,x2=lb.x,y2=lb.y,x3=sa.x,y3=sa.y,x4=sb.x,y4=sb.y;
  const d=(x1-x2)*(y3-y4)-(y1-y2)*(x3-x4);
  if(Math.abs(d)<1e-10)return null;
  const t=((x1-x3)*(y3-y4)-(y1-y3)*(x3-x4))/d;
  return new Point(x1+t*(x2-x1),y1+t*(y2-y1));
}

// [垂线] 点到直线的垂足
function perpFoot(P,A,B){
  const dx=B.x-A.x,dy=B.y-A.y,ls=dx*dx+dy*dy;
  if(ls<1e-10)return null;
  const t=((P.x-A.x)*dx+(P.y-A.y)*dy)/ls;
  return new Point(A.x+t*dx,A.y+t*dy);
}

// [角平分线] 顶点 v 到 p1、p2 的角平分线方向单位向量
function angleBisectorDir(v,p1,p2){
  const dx1=p1.x-v.x,dy1=p1.y-v.y,l1=Math.sqrt(dx1*dx1+dy1*dy1);
  const dx2=p2.x-v.x,dy2=p2.y-v.y,l2=Math.sqrt(dx2*dx2+dy2*dy2);
  if(l1<1e-10||l2<1e-10)return null;
  const bx=dx1/l1+dx2/l2,by=dy1/l1+dy2/l2,bl=Math.sqrt(bx*bx+by*by);
  if(bl<1e-10)return null;
  return new Point(bx/bl,by/bl);
}

// [延长线/平行线] 射线与线段的交点
function rayLineIntersection(origin,dir,la,lb){
  const x1=origin.x,y1=origin.y,x2=origin.x+dir.x,y2=origin.y+dir.y;
  const x3=la.x,y3=la.y,x4=lb.x,y4=lb.y;
  const d=(x1-x2)*(y3-y4)-(y1-y2)*(x3-x4);
  if(Math.abs(d)<1e-10)return null;
  const t=((x1-x3)*(y3-y4)-(y1-y3)*(x3-x4))/d;
  if(t<0.001)return null;
  return new Point(x1+t*(x2-x1),y1+t*(y2-y1));
}

// [平折线] 点到射线的最近距离
function pointToRayDistance(pt,origin,angleDeg){
  const rad=angleDeg*Math.PI/180,dx=pt.x-origin.x,dy=pt.y-origin.y;
  const t=dx*Math.cos(rad)+dy*Math.sin(rad);
  if(t<=0)return origin.distance(pt);
  const px=origin.x+t*Math.cos(rad),py=origin.y+t*Math.sin(rad);
  return Math.sqrt((pt.x-px)**2+(pt.y-py)**2);
}

// [镜像] 点关于线 ab 的对称点
function mirrorPoint(p,a,b){
  const dx=b.x-a.x,dy=b.y-a.y,ls=dx*dx+dy*dy;
  if(ls<1e-10)return new Point(p.x,p.y);
  const t=((p.x-a.x)*dx+(p.y-a.y)*dy)/ls;
  const fx=a.x+t*dx,fy=a.y+t*dy;
  return new Point(2*fx-p.x,2*fy-p.y);
}

// ═══════════════════════════════════════════════
// 2. 通用辅助 — 吸附、采样、选择/擦除共享工具
// ═══════════════════════════════════════════════

// 按给定采样密度将路径展为点数组（画笔模式用）
function sampleBrushPath(path){const r=12/camera.zoom,s=[];for(let i=0;i<path.length-1;i++){const a=path[i],b=path[i+1],len=a.distance(b),st=Math.max(2,r/2),n=Math.max(2,Math.ceil(len/st));for(let j=0;j<=n;j++){const t=j/n;s.push(new Point(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t));}}return s;}

// 吸附点查找 — 优先已有顶点，其次网格点（50px 间距）
function findSnapPoint(pt){
  const sd=12/camera.zoom;let best=null,bestD=sd;
  for(const l of cp.lines)for(const e of[l.a,l.b]){const d=pt.distance(e);if(d<bestD){bestD=d;best=e;}}
  const gs=50,gx=Math.round(pt.x/gs)*gs,gy=Math.round(pt.y/gs)*gs,gp=new Point(gx,gy);
  if(pt.distance(gp)<bestD)best=gp;
  return best;
}

// 取消全部选中
function deselectAll(){cp.lines.forEach(l=>l.selected=false);}
// 反选
function invertSelection(){cp.lines.forEach(l=>l.selected=!l.selected);}

// Ctrl+反选快照 — 记录当前选中集，拖拽中做反选切换
function captureToggleSnapshot(e){return(e.ctrlKey||e.metaKey)?new Set(cp.lines.filter(l=>l.selected)):null;}

// ── 共享查找器（选择/擦除复用）─────────────────
function _findLinesInBox(a,b){
  const mix=Math.min(a.x,b.x),mxx=Math.max(a.x,b.x),miy=Math.min(a.y,b.y),mxy=Math.max(a.y,b.y);
  return cp.lines.filter(l=>{
    const bI=l.a.x>=mix&&l.a.x<=mxx&&l.a.y>=miy&&l.a.y<=mxy&&l.b.x>=mix&&l.b.x<=mxx&&l.b.y>=miy&&l.b.y<=mxy;
    return bI||lineIntersectsRect(l,mix,miy,mxx,mxy);
  });
}
function _findLinesInPolygon(path){
  return cp.lines.filter(l=>pointInPolygon(l.a,path)&&pointInPolygon(l.b,path));
}
function _findLinesByBrush(path){
  if(path.length<2)return[];
  const samples=sampleBrushPath(path),bR=12/camera.zoom,tr=new Set();
  for(const l of cp.lines)for(const sp of samples)if(ptToSegDist(sp,l.a,l.b)<bR){tr.add(l);break;}
  return [...tr];
}

// ═══════════════════════════════════════════════
// 3. 选择 — 框选 / 套索 / 画笔
// ═══════════════════════════════════════════════

function selectLinesInBox(a,b,clearFirst,toggleSnap=null){
  if(clearFirst)deselectAll();
  for(const l of _findLinesInBox(a,b))l.selected=toggleSnap?!toggleSnap.has(l):true;
}
function selectLinesInPolygon(path,clearFirst,toggleSnap=null){
  if(clearFirst)deselectAll();
  for(const l of _findLinesInPolygon(path))l.selected=toggleSnap?!toggleSnap.has(l):true;
}
function selectLinesByBrush(path,clearFirst,toggleSnap=null){
  if(clearFirst)deselectAll();
  for(const l of _findLinesByBrush(path))l.selected=toggleSnap?!toggleSnap.has(l):true;
}

// ═══════════════════════════════════════════════
// 4. 擦除 — 框擦 / 套擦 / 笔擦
// ═══════════════════════════════════════════════

function directEraseInBox(a,b){
  const tr=_findLinesInBox(a,b);
  tr.forEach(l=>cp.deleteLine(l));if(tr.length){saveState();rerunChecks();updateStats();}
}
function directEraseInPolygon(path){
  const tr=_findLinesInPolygon(path);
  tr.forEach(l=>cp.deleteLine(l));if(tr.length){saveState();rerunChecks();updateStats();}
}
function directEraseByBrush(path){
  const tr=_findLinesByBrush(path);
  tr.forEach(l=>cp.deleteLine(l));if(tr.length){saveState();rerunChecks();updateStats();}
}
function previewEraseByBrush(path){
  cp.lines.forEach(l=>l._erasePreview=false);
  for(const l of _findLinesByBrush(path))l._erasePreview=true;
}

// ═══════════════════════════════════════════════
// 5. 绘制 — 折线 / 兔耳折 / 平折线
// ═══════════════════════════════════════════════

// [折线] 添加线段并自动分割交点（核心绘制函数）
function addLineWithSplit(line){
  const intersections=[];
  for(const l of cp.lines){
    const pt=segIntersection(line.a,line.b,l.a,l.b);
    if(pt)intersections.push({point:pt,existingLine:l});
  }
  if(intersections.length===0){cp.addLine(line);return;}
  // 分割已有线段
  for(const{point,existingLine}of intersections){
    cp.deleteLine(existingLine);
    cp.addLine(new LineSegment(existingLine.a,point,existingLine.color));
    cp.addLine(new LineSegment(point,existingLine.b,existingLine.color));
  }
  // 新线按交点分段添加（容差内去重）
  const tol=1/camera.zoom;
  const pts=intersections.map(i=>i.point);
  pts.sort((p,q)=>line.a.distance(p)-line.a.distance(q));
  const merged=[pts[0]];
  for(let i=1;i<pts.length;i++){
    if(pts[i].distance(merged[merged.length-1])>tol)merged.push(pts[i]);
  }
  let prev=line.a;
  for(const pt of merged){cp.addLine(new LineSegment(prev,pt,line.color));prev=pt;}
  cp.addLine(new LineSegment(prev,line.b,line.color));
}

// [兔耳折] 三点内心 → 分别连线
function addRabbitEar(A,B,C){
  const a=B.distance(C),b=C.distance(A),c=A.distance(B),sum=a+b+c;
  if(sum<1e-6)return;
  const I=new Point((a*A.x+b*B.x+c*C.x)/sum,(a*A.y+b*B.y+c*C.y)/sum);
  for(const v of[A,B,C])if(v.distance(I)>1){addLineWithSplit(new LineSegment(v,I,currentColor));}
  saveState();rerunChecks();updateStats();render();
}

// [平折线] 找鼠标最近的候选射线
function nearestFlatCandidate(pt,state){
  let best=null,bestD=20/camera.zoom;
  for(const c of state.candidates){
    const d=pointToRayDistance(pt,state.vertex,c.angle);
    if(d<bestD){bestD=d;best=c;}
  }
  return best;
}

// [平折线] O(n) 计算顶点处的等角扇形候选方向（仅 M/V 线，奇数条）
function findFlatFoldCandidates(vertex){
  const items=[];
  for(const l of cp.lines){
    if(l.color!=='M'&&l.color!=='V')continue;
    if(vertex.distance(l.a)<0.01)items.push({line:l,angle:vertex.angleTo(l.b)});
    else if(vertex.distance(l.b)<0.01)items.push({line:l,angle:vertex.angleTo(l.a)});
  }
  const n=items.length;
  if(n%2===0)return[]; // 奇数条才能用单线修复
  items.sort((a,b)=>a.angle-b.angle);
  // 计算扇形角度
  const sectors=[];
  for(let i=0;i<n;i++){
    let d=items[(i+1)%n].angle-items[i].angle;
    if(d<0)d+=360;
    sectors.push(d);
  }
  if(n===1)sectors[0]=360;
  // 初始交错和 Δ₀ = s₀ − s₁ + s₂ − s₃ + … + sₙ₋₁
  let delta=0;
  for(let i=0;i<n;i++)delta+=(i%2===0)?sectors[i]:-sectors[i];
  // O(1) 递推：Δᵢ₊₁ = 2·sᵢ − Δᵢ
  const candidates=[];
  for(let i=0;i<n;i++){
    const a=delta/2;
    if(a>0.01&&a<sectors[i]-0.01){
      let newAngle=items[i].angle+a;
      if(newAngle>=360)newAngle-=360;
      candidates.push({angle:newAngle});
    }
    delta=2*sectors[i]-delta;
  }
  return candidates;
}

// ═══════════════════════════════════════════════
// 6. 变换 — 镜像
// ═══════════════════════════════════════════════

// [镜像] 将选中线段关于轴 ab 作镜像（移动/复制工具的对称逻辑在鼠标事件中）
function mirrorLines(a,b){
  const added=[];
  for(const l of cp.lines)if(l.selected){
    const ma=mirrorPoint(l.a,a,b),mb=mirrorPoint(l.b,a,b);
    if(ma.distance(mb)>0.01)added.push(new LineSegment(ma,mb,l.color));
  }
  cp.addLinesBulk(added);
}

// ═══════════════════════════════════════════════
// 7. 饼菜单 — Maya 风格二级标记菜单
//    单环替换：鼠标移到父级扇区 → 环切换为子菜单，移回中心退回
// ═══════════════════════════════════════════════

// ── 菜单树定义（数据源）────────────────────────
// dir=方向(N/NE/E/SE/S/SW/W/NW), key=i18n键, action=执行动作
// children=子菜单项数组（8项，null=空位），有 children 即为父级扇区
const RADIAL_MENU_TREE = [
  // N  — 绘制 ▸
  { key: 'group.draw', action: null, children: [
    { key: 'tool.drawLine',        action: 'drawLine' },
    { key: 'tool.rabbitEar',       action: 'drawRabbitEar' },
    { key: 'tool.flatFold',        action: 'drawFlatFold' },
    { key: 'tool.extension',       action: 'drawExtension' },
    { key: 'tool.perpendicular',   action: 'drawPerpendicular' },
    { key: 'tool.bisector',        action: 'drawBisector' },
    { key: 'tool.parallel',        action: 'drawParallel' },
    null,
  ]},
  // NE — 撤销
  { key: 'tb.undo', action: 'undo', children: null },
  // E  — 变换 ▸
  { key: 'group.transform', action: null, children: [
    { key: 'tool.move',   action: 'move' },
    { key: 'tool.copy',   action: 'copy' },
    { key: 'tool.mirror', action: 'mirror' },
    null, null, null, null, null,
  ]},
  // SE —（空）
  { key: '', action: null, children: null },
  // S  — 橡皮擦 ▸
  { key: 'group.erase', action: null, children: [
    { key: 'ers.point', action: 'ersPoint' },
    { key: 'ers.box',   action: 'ersBox' },
    { key: 'ers.lasso', action: 'ersLasso' },
    { key: 'ers.brush', action: 'ersBrush' },
    null, null, null, null,
  ]},
  // SW — 线型 ▸（M/V/B/A）
  { key: 'group.lineType', action: null, children: [
    { key: 'color.mountain', action: 'colorM' },
    { key: 'color.valley',   action: 'colorV' },
    { key: 'color.border',   action: 'colorB' },
    { key: 'color.aux',      action: 'colorA' },
    null, null, null, null,
  ]},
  // W  — 选择 ▸
  { key: 'group.select', action: null, children: [
    { key: 'sel.point',  action: 'selPoint' },
    { key: 'sel.box',    action: 'selBox' },
    { key: 'sel.lasso',  action: 'selLasso' },
    { key: 'sel.brush',  action: 'selBrush' },
    { key: 'sel.clear',  action: 'selClear' },
    { key: 'sel.invert', action: 'selInvert' },
    null, null,
  ]},
  // NW —（空）
  { key: '', action: null, children: null },
];

// ── 运行时状态 ─────────────────────────────────
let radialActive = false;         // 饼菜单是否打开
let radialCenter = null;          // 一级饼菜单屏幕中心 {x, y}
let radialCenterL2 = null;       // 二级饼菜单屏幕中心（偏移到父扇区位置）
let radialLevel = 1;             // 当前层级：1 或 2
let radialParentIdx = -1;        // 二级时对应的父级扇区索引 0-7
let radialHighlight = -1;        // 当前高亮扇区索引 0-7
let radialSectors = [];          // 当前显示的 8 个扇区 [{label, action}]
let radialLevel1 = [];           // 一级扇区（常驻）[{label, action, hasChildren}]
let radialCursor = null;         // 当前鼠标屏幕坐标 {x,y}
let radialL1End = null;          // 进入二级时冻结的一级路径终点 {x,y}
let radialBySpace = false;       // 是否由空格键触发（松键执行）

// ── 从菜单树重建标签（语言切换时调用）─────────
function buildRadialLabels() {
  radialLevel1 = RADIAL_MENU_TREE.map(item => ({
    label: t(item.key),
    action: item.action,
    hasChildren: !!item.children,
  }));
}
buildRadialLabels();

// ── 从父级索引构建二级扇区 ─────────────────────
function radialBuildLevel2(parentIdx) {
  const children = RADIAL_MENU_TREE[parentIdx].children;
  return children.map(child => child
    ? { label: t(child.key), action: child.action }
    : { label: '', action: '' }
  );
}

// ── 扇区中点半径（一级环 24-80px 的中点）────────
const RADIAL_MID_R = 104; // (88+120)/2

// ── 展开动画 ────────────────────────────────────
let radialAnimStart = 0;           // 动画起始时间戳，0=不在动画中
const RADIAL_ANIM_DURATION = 60;  // 动画时长 ms (6/100 秒)

function radialAnimLoop() {
  if (!radialActive) { radialAnimStart = 0; return; }
  if (performance.now() - radialAnimStart < RADIAL_ANIM_DURATION) {
    render();
    requestAnimationFrame(radialAnimLoop);
  } else {
    radialAnimStart = 0;
    render();
  }
}

// ── 打开饼菜单 ─────────────────────────────────
function openRadial(bySpace=false){
  const r=canvas.getBoundingClientRect();
  radialCenter={x:lastScreenX-r.left,y:lastScreenY-r.top};
  radialActive=true;
  radialLevel=1;
  radialParentIdx=-1;
  radialHighlight=-1;
  radialSectors=radialLevel1;
  radialCursor=null;
  radialL1End=null;
  radialBySpace=bySpace;
  radialAnimStart=performance.now();
  requestAnimationFrame(radialAnimLoop);
  render();
}

// ── 钻入二级菜单（中心跳到父扇区中点）───────────
function radialEnterLevel2(parentIdx) {
  const ang = (-90 + parentIdx * 45) * Math.PI / 180;
  radialCenterL2 = {
    x: radialCenter.x + RADIAL_MID_R * Math.cos(ang),
    y: radialCenter.y + RADIAL_MID_R * Math.sin(ang),
  };
  radialLevel = 2;
  radialParentIdx = parentIdx;
  radialSectors = radialBuildLevel2(parentIdx);
  radialHighlight = -1;
  radialL1End = radialCenterL2 ? {x:radialCenterL2.x,y:radialCenterL2.y} : null;
  radialAnimStart = performance.now();
  requestAnimationFrame(radialAnimLoop);
  render();
}

// ── 执行饼菜单动作 ─────────────────────────────
function radialExecute(index) {
  if (radialLevel === 2) {
    const a = radialSectors[index]?.action;
    if (a) executeRadialAction(a);
    return;
  }
  // Level 1 — 仅叶节点可执行（父节点需钻入二级）
  const item = radialLevel1[index];
  if (item && item.action && !item.hasChildren) {
    executeRadialAction(item.action);
  }
}

function executeRadialAction(a) {
  if (a.startsWith('color')) { currentColor = a[5]; setTool('draw'); updateColorBarUI(); }
  else if (a === 'selClear') { deselectAll(); render(); }
  else if (a === 'selInvert') { invertSelection(); render(); }
  else if (a.startsWith('sel')) { setTool('select'); setSelectMode(a.slice(3).toLowerCase()); }
  else if (a.startsWith('draw')) { setTool('draw'); setDrawMode(a[4].toLowerCase() + a.slice(5)); }
  else if (a.startsWith('ers')) { setTool('erase'); setEraseMode(a.slice(3).toLowerCase()); }
  else if (a === 'undo') undo();
  else setTool(a);
}

// ═══════════════════════════════════════════════
// 8. 工具切换 — setTool / 子模式 / 工作模式
// ═══════════════════════════════════════════════

// 绘图 ↔ 阅览模式切换（画布右下角按钮）
function toggleWorkMode(){
  const btn=document.getElementById('btnWorkMode');
  if(workMode==='edit'){
    _savedTool=currentTool;setTool('pan');workMode='view';
    btn.textContent=t('wm.view');btn.title=t('wm.switchToEdit');
    // 禁用工具组和颜色栏，保留检测/统计区域
    document.querySelectorAll('#colorBar, .tool-group, #sectDetect').forEach(el=>{el.style.pointerEvents='none';el.style.opacity='0.35';});
  }else{
    workMode='edit';
    btn.textContent=t('wm.edit');btn.title=t('wm.switchToView');
    document.querySelectorAll('#colorBar, .tool-group').forEach(el=>{el.style.pointerEvents='';el.style.opacity='';});
    if(_savedTool)setTool(_savedTool);
  }
}

// 工具 → 侧栏分组 映射表
const TOOL_GROUP={draw:'draw',select:'select',erase:'erase',pan:'view',move:'transform',copy:'transform',mirror:'transform'};

// 本地化工具名称/提示
function getToolName(tool){return t('toolName.'+tool)||tool;}
function getToolHint(tool){return t('hint.'+tool)||'';}

// 工具 → 光标样式 映射表
const TOOL_CURSOR={pan:'grab',move:'move',copy:'copy'};

// 切换当前工具（核心入口）
function setTool(tool){
  currentTool=tool;rabbitEarPoints=[];extensionFirstLine=null;perpPoint=null;bisectorState=null;parallelPoint=null;parallelLine1=null;flatFoldState=null;moveActive=false;moveOrigin=null;mirrorP1=null;
  document.querySelectorAll('.tool-group').forEach(g=>g.classList.remove('active'));
  const g=TOOL_GROUP[tool];if(g)document.querySelector(`.tool-group[data-group="${g}"]`)?.classList.add('active');
  document.getElementById('statusTool').textContent=t('status.tool')+'：'+(getToolName(tool)||tool);
  document.getElementById('statusHint').textContent=t('status.hint')+'：'+(tool==='select'?selectModeHint():tool==='erase'?eraseModeHint():tool==='draw'?drawModeHint():getToolHint(tool)||'');
  canvas.style.cursor=TOOL_CURSOR[tool]||'crosshair';
  // 变换工具高亮
  if(tool==='move'||tool==='copy'||tool==='mirror'){
    document.querySelectorAll('.tool-group[data-group="transform"] .tool-group__body button').forEach(b=>b.classList.remove('selected'));
    document.getElementById('btn'+tool.charAt(0).toUpperCase()+tool.slice(1))?.classList.add('selected');
  }
}

// 设置绘制子模式（折线/兔耳折/平折线/延长线/垂线/角平分线/平行线）
function setDrawMode(m){
  drawMode=m;
  document.querySelectorAll('.tool-group[data-group="draw"] .tool-group__body button').forEach(b=>b.classList.remove('selected'));
  document.getElementById('btnDraw'+m.charAt(0).toUpperCase()+m.slice(1))?.classList.add('selected');
  if(currentTool==='draw')document.getElementById('statusHint').textContent=t('status.hint')+'：'+drawModeHint();
}
function drawModeHint(){return t('hint.'+drawMode)||'';}

// 设置选择子模式（点选/框选/套索/画笔）
function setSelectMode(m){
  selectMode=m;
  const cap=m.charAt(0).toUpperCase()+m.slice(1);
  document.querySelectorAll('.tool-group[data-group="select"] .tool-group__body button').forEach(b=>b.classList.remove('selected'));
  document.getElementById('btnSel'+cap)?.classList.add('selected');
  if(currentTool==='select')document.getElementById('statusHint').textContent=t('status.hint')+'：'+selectModeHint();
}
function selectModeHint(){return t('hint.sel'+selectMode.charAt(0).toUpperCase()+selectMode.slice(1))||'';}

// 设置擦除子模式（点擦/框擦/套擦/笔擦）
function setEraseMode(m){
  eraseMode=m;
  const cap=m.charAt(0).toUpperCase()+m.slice(1);
  document.querySelectorAll('.tool-group[data-group="erase"] .tool-group__body button').forEach(b=>b.classList.remove('selected'));
  document.getElementById('btnErs'+cap)?.classList.add('selected');
  if(currentTool==='erase')document.getElementById('statusHint').textContent=t('status.hint')+'：'+eraseModeHint();
}
function eraseModeHint(){return t('hint.ers'+eraseMode.charAt(0).toUpperCase()+eraseMode.slice(1))||'';}

// 更新颜色栏高亮
function updateColorBarUI(){document.querySelectorAll('#colorBar button').forEach(b=>b.classList.toggle('active',b.dataset.color===currentColor));}
