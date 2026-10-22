// 作品展示用大学课程笔记。仅经 HTTP 增量创建，按标题复用已有内容。
import { writeFile } from 'node:fs/promises';
const base = 'http://localhost:3000';
const titles = ['高数｜从导数到简谐振动方程','高数｜泰勒展开与平衡点附近的线性化','线代｜特征值、特征向量与正常模态','物理｜耦合振子与能量守恒','物理｜受迫振动、共振与模态叠加'];
const entries = [
String.raw`## 学习主线
导数描述瞬时变化，二阶导数描述变化率如何改变。将它们放进牛顿第二定律，就能把运动现象转成可求解的微分方程。

## 从位移到运动方程
设位移为 $x(t)$，速度 $v=\mathrm dx/\mathrm dt$，加速度 $a=\mathrm d^2x/\mathrm dt^2$。理想弹簧在弹性范围内满足胡克定律 $F=-kx$，故
$$m\ddot{x}+kx=0,\qquad \omega_0=\sqrt{k/m}.$$
解为 $x(t)=A\cos(\omega_0t)+B\sin(\omega_0t)$。初值 $x(0)=x_0$、$\dot{x}(0)=v_0$ 给出 $A=x_0$、$B=v_0/\omega_0$。角频率单位为 rad/s，周期 $T=2\pi/\omega_0$。

## 计算例题
取 $m=1\,\mathrm{kg}$、$k=4\,\mathrm{N/m}$，初始位移 $0.10\,\mathrm m$、初速度为零，则 $x(t)=0.10\cos(2t)$，周期为 $\pi\,\mathrm s$。两次求导后代回方程可检验解。

## 为什么这条方程很普遍
实际回复力通常不是严格线性的。[[高数｜泰勒展开与平衡点附近的线性化]]说明稳定平衡点附近为何能近似成弹簧。多个自由度时，标量方程升级为矩阵方程，见[[线代｜特征值、特征向量与正常模态]]。[[物理｜耦合振子与能量守恒]]用动能和势能检查运动；[[物理｜受迫振动、共振与模态叠加]]进一步加入周期外力。

## 自测与易错点
为什么回复力前有负号？因为它指向平衡位置。不要把频率 $f$ 与角频率 $\omega$ 混用：$\omega=2\pi f$。本例中振幅不影响周期，是理想线性模型的结论。
`,
String.raw`## 从非线性到可解模型
真实势能 $U(x)$ 可能复杂，但在平衡点附近可以用低阶多项式近似。泰勒展开把高数与振动物理连接起来。

## 展开与稳定条件
令 $x=x_*+\xi$，其中 $U'(x_*)=0$。若势能足够光滑，
$$U(x_*+\xi)=U(x_*)+\frac12 U''(x_*)\xi^2+O(\xi^3).$$
由 $F=-U'(x)$ 得 $m\ddot{\xi}+U''(x_*)\xi\approx0$。当 $U''(x_*)>0$ 时为局部稳定的简谐振动，$\omega_0=\sqrt{U''(x_*)/m}$；当二阶导为零时，必须检查更高阶项，不能直接判定稳定性。

## 单摆例题
单摆势能为 $U(\theta)=mg\ell(1-\cos\theta)$。用 $\cos\theta\approx1-\theta^2/2$ 得 $U\approx mg\ell\theta^2/2$。动能为 $m\ell^2\dot\theta^2/2$，因此 $\ddot\theta+(g/\ell)\theta\approx0$，$T\approx2\pi\sqrt{\ell/g}$。角度须使用弧度；振幅变大时小角度近似的误差也增大。

## 多变量版本
在平衡点附近 $U(\boldsymbol\xi)\approx U_*+\boldsymbol\xi^TK\boldsymbol\xi/2$，其中 $K$ 是势能的 Hessian 矩阵。质量矩阵 $M$ 为正定时，运动方程为 $M\ddot{\boldsymbol\xi}+K\boldsymbol\xi=0$。正定的 $K$ 对应严格局部极小的二次近似，特征方向见[[线代｜特征值、特征向量与正常模态]]。

## 关联与自测
[[高数｜从导数到简谐振动方程]]给出线性化后的解法；[[物理｜耦合振子与能量守恒]]展示 Hessian 的非对角项如何表示耦合；[[物理｜受迫振动、共振与模态叠加]]只在线性近似有效时使用叠加原理。自测：若 $U=ax^4$ 且 $a>0$，原点虽稳定，为什么不能由二阶展开得到非零固有频率？
`,
String.raw`## 核心问题
多个物体相连后，直接求每个坐标很繁琐。特征向量给出能够保持固定振幅比例、独立振动的方向，这就是正常模态。

## 从方程到广义特征值
对于 $M\ddot{\boldsymbol x}+K\boldsymbol x=0$，试取 $\boldsymbol x=\boldsymbol a\cos(\omega t+\phi)$，得到
$$K\boldsymbol a=\omega^2M\boldsymbol a.$$
质量相同时 $M=mI$，可求 $K/m$ 的特征值。特征值是角频率的平方，并非角频率。更一般地，$M$ 正定、$K$ 对称时，可研究对称矩阵 $M^{-1/2}KM^{-1/2}$；模态可按质量内积正交归一化。

## 两自由度算例
两个质量均为 $m$ 的物体，两侧墙弹簧与中间弹簧的劲度均为 $k$：
$$K=k\begin{pmatrix}2&-1\\-1&2\end{pmatrix}.$$
特征向量 $\boldsymbol a_1=(1,1)^T$ 对应 $\omega_1^2=k/m$；$\boldsymbol a_2=(1,-1)^T$ 对应 $\omega_2^2=3k/m$。同相模态不拉伸中间弹簧，反相模态使回复作用更强，因此频率更高。

## 初值如何分解
令 $q_1=(x_1+x_2)/\sqrt2$、$q_2=(x_1-x_2)/\sqrt2$。当初始位移为 $(a,0)^T$、速度为零时，
$$x_1=\frac a2(\cos\omega_1t+\cos\omega_2t),\quad x_2=\frac a2(\cos\omega_1t-\cos\omega_2t).$$
一般运动是模态的线性组合，而非所有坐标共享一个频率。

## 跨课连接
模态内的时间函数由[[高数｜从导数到简谐振动方程]]求解；矩阵 $K$ 来自[[高数｜泰勒展开与平衡点附近的线性化]]的 Hessian；物理装置与能量见[[物理｜耦合振子与能量守恒]]；外力投影到各模态后的响应见[[物理｜受迫振动、共振与模态叠加]]。
`,
String.raw`## 系统与假设
两个质量均为 $m$ 的物体由三根劲度均为 $k$ 的弹簧连接到两侧固定墙。以平衡位置为零点，只研究一维小振动，忽略阻尼和外力。

## 从受力得到耦合方程
中间弹簧的伸长量为 $x_2-x_1$。于是
$$m\ddot x_1=-2kx_1+kx_2,\qquad m\ddot x_2=kx_1-2kx_2.$$
耦合项表示一个物体的位置会改变另一个物体的回复力。矩阵形式与求解过程见[[线代｜特征值、特征向量与正常模态]]。

## 用能量独立核对
$$T=\frac m2(\dot x_1^2+\dot x_2^2),\qquad U=\frac k2[x_1^2+(x_2-x_1)^2+x_2^2].$$
沿解求导，$\dot E=\dot{\boldsymbol x}^T(M\ddot{\boldsymbol x}+K\boldsymbol x)=0$，因此总机械能守恒。单个物体的机械能可以随相互作用而改变，但系统总能量不变。

## 模态坐标下的能量
采用正交坐标 $q_1=(x_1+x_2)/\sqrt2$、$q_2=(x_1-x_2)/\sqrt2$，能量变为
$$E=\frac m2(\dot q_1^2+\dot q_2^2)+\frac k2q_1^2+\frac{3k}{2}q_2^2.$$
它是两个独立振子的能量之和。若 $m=1\,\mathrm{kg}$、$k=4\,\mathrm{N/m}$，则固有角频率分别为 $2$ 与 $2\sqrt3\,\mathrm{rad/s}$。

## 知识网络与易错点
二阶时间导数的意义见[[高数｜从导数到简谐振动方程]]；二次势能与刚度矩阵的关系见[[高数｜泰勒展开与平衡点附近的线性化]]。加入外力或阻尼后，能量守恒改为功率平衡，见[[物理｜受迫振动、共振与模态叠加]]。不要把中间弹簧伸长写成 $x_1+x_2$，也不要漏掉两端墙弹簧的势能。
`,
String.raw`## 外力如何选择振动模式
周期驱动力既有频率，也有空间分布。能否激发某个模态，取决于驱动力在该模态方向的投影。

## 单自由度稳态响应
考虑 $m\ddot x+c\dot x+kx=F_0\cos(\Omega t)$，$c>0$。瞬态衰减后，稳态位移振幅为
$$A(\Omega)=\frac{F_0}{\sqrt{(k-m\Omega^2)^2+(c\Omega)^2}}.$$
相位滞后可用 $\delta=\operatorname{atan2}(c\Omega,k-m\Omega^2)$ 表示。当 $c^2<2mk$ 时，非零频率的位移振幅峰出现在 $\Omega_r=\sqrt{k/m-c^2/(2m^2)}$。它通常略小于无阻尼固有角频率；阻尼足够大时无此非零频率峰。

## 无阻尼共振的边界
若 $c=0$ 且 $\Omega=\omega_0$，稳态振幅公式不适用。一个特解为 $x_p=F_0t\sin(\omega_0t)/(2m\omega_0)$，振幅随时间增长。真实系统最终会受到阻尼、非线性或材料限制。

## 两振子的模态选择
沿用[[物理｜耦合振子与能量守恒]]的装置与[[线代｜特征值、特征向量与正常模态]]的正交模态。若外力向量为 $(F,F)^T\cos\Omega t$，只激发同相模态；若为 $(F,-F)^T\cos\Omega t$，只激发反相模态。仅对第一个物体施力则一般会同时激发两个模态。阻尼为 $C=cI$ 时此变换仍可解耦，一般阻尼矩阵不保证这一点。

## 从守恒到功率平衡
$$\dot E=\dot{\boldsymbol x}^T\boldsymbol F-\dot{\boldsymbol x}^TC\dot{\boldsymbol x}.$$
稳态一周期内平均输入功率等于平均耗散功率。[[高数｜从导数到简谐振动方程]]提供微分方程基础；[[高数｜泰勒展开与平衡点附近的线性化]]解释叠加法的适用范围。

## 自测
驱动频率等于某个固有频率时，为何仍可能不激发该模态？因为对应的模态力投影可以为零。把“频率匹配”和“空间投影非零”同时检查，才能解释共振。
`
];
const notes = entries.map((content,i)=>({title:titles[i],text:`# ${titles[i]}\n\n${content}\n## 内容说明\n大学课程学习示例，按标准模型独立编写；算例采用理想化假设。\n`,summary:['由导数、牛顿第二定律推导简谐振动，连接初值、周期与多自由度系统。','从泰勒展开、小角度单摆到 Hessian，解释振动模型的线性化条件。','用广义特征值与正交变换求解正常模态，连接数学结构与物理频率。','从两质量三弹簧模型推导耦合方程，以能量守恒核对模态分解。','研究阻尼共振、外力的模态投影与功率平衡，说明叠加的适用条件。'][i],concepts:['简谐振动','线性系统','正常模态','能量'],keywords:['大学课程','振动与线性系统',i<2?'高等数学':i===2?'线性代数':'大学物理']}));
const reasons=['导数方程与势能泰勒展开连接局部简谐近似','单自由度微分方程是每个正常模态的时间方程','牛顿第二定律与能量法描述同一耦合系统','自由振动方程加入周期外力得到受迫响应','Hessian 刚度矩阵的特征值决定线性化频率','耦合弹簧的二次势能给出 Hessian 刚度矩阵','泰勒线性化限定模态叠加与共振公式的适用范围','特征向量解耦两质量三弹簧的运动与能量','外力在特征向量方向的投影决定被激发模态','耦合系统加入外力与阻尼后从守恒转为功率平衡'];
const links=[];let n=0;for(let i=0;i<5;i++)for(let j=i+1;j<5;j++)links.push({from:titles[i],to:titles[j],reason:reasons[n++]});
const seed={notes,links};
await writeFile(new URL('../seed/university-notes.json',import.meta.url),JSON.stringify(seed,null,2)+'\n');
async function call(method,path,payload){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})});const b=await r.json();if(!r.ok)throw Error(`${path}: ${r.status} ${JSON.stringify(b)}`);return b;}
const existing=(await call('GET','/api/knowledge')).knowledges;
const raws=(await call('GET','/api/raw')).raws;
const ids=new Map(existing.map(n=>[n.title,n.id]));
for(const note of notes){if(ids.has(note.title))continue;const raw=raws.find(r=>r.title===note.title)??(await call('POST','/api/raw',{title:note.title,text:note.text})).raw;const result=await call('POST','/api/knowledge',{rawId:raw.id,origin:'ai',draft:{title:note.title,summary:note.summary,content:note.text,rawCategory:'articles',wikiCategory:'sources',keyPoints:[note.summary],concepts:note.concepts,keywords:note.keywords,relatedKnowledge:[]}});ids.set(note.title,result.knowledge.id);console.log('已收录',note.title);}
for(const l of links)await call('POST','/api/relations',{sourceId:ids.get(l.from),targetId:ids.get(l.to),type:'related',reason:l.reason});
const graph=await call('GET','/api/graph');
const selected=new Set(titles.map(t=>ids.get(t)));
console.log(JSON.stringify({notes:graph.nodes.filter(n=>selected.has(n.id)).length,edges:graph.edges.filter(e=>selected.has(e.source)&&selected.has(e.target)).length,totalNodes:graph.nodes.length,totalEdges:graph.edges.length}));
