import { templates } from '../templates/catalog';
import './app.css';

export default function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="主导航">
        <a className="brand" href="#home"><span className="brand-mark">▦</span><span>开发路线<small>DEVELOPMENT DASHBOARD</small></span></a>
        <div className="sidebar-section">工作空间</div>
        <div className="nav-active"><span>▤</span> 项目概览</div>
        <div className="sidebar-hint"><strong>第一次开发？</strong><p>从一条路线开始，一步一步把想法变成现实。</p></div>
      </aside>
      <main id="home" className="main-content">
        <header className="topbar"><span>工作空间 <span className="muted">/ 项目概览</span></span><span className="beginner-pill">✦ 新手模式已开启</span></header>
        <div className="page-content">
          <div className="eyebrow"><span className="eyebrow-dot" /> 从这里开始</div>
          <h1>让每一步开发，都<span>清晰可见。</span></h1>
          <p className="intro">连接你的 GitHub 项目，把散落的文档和开发进度放到一张路线图上。</p>
          <section className="connect-card" aria-labelledby="connect-title">
            <div className="card-icon">↗</div>
            <div className="connect-body"><h2 id="connect-title">连接你的项目</h2><p>输入 GitHub 仓库地址，开始探索你的开发路线。</p>
              <label htmlFor="repo-url">GitHub 仓库地址</label>
              <div className="connect-row"><input id="repo-url" placeholder="https://github.com/owner/repository" autoComplete="url" /><button type="button" disabled>连接仓库 <span>→</span></button></div>
              <small>公开仓库可直接连接 · 私有仓库需要授权</small>
            </div>
          </section>
          <section className="route-intro" aria-labelledby="route-title"><div><div className="section-kicker">YOUR DEVELOPMENT JOURNEY</div><h2 id="route-title">你的开发路线</h2><p>不必一次完成所有事情。先看全貌，再从眼前的一步开始。</p></div><span className="recommended">推荐路线</span></section>
          <div className="route-preview" aria-label="通用应用开发流程">{templates[0].graph.nodes.map((node, index) => <div className="route-step" key={node.id}><span className="step-number">{String(index + 1).padStart(2, '0')}</span><strong>{node.title}</strong><small>等待开始</small></div>)}</div>
          <div className="footer-note">✳ 你的文档留在原来的仓库中，我们只读取它们。</div>
        </div>
      </main>
    </div>
  );
}
