import { useState } from 'react'
import { Copy, Check, Terminal, Play, Cpu, ShieldCheck } from 'lucide-react'

export function QuickstartTerminal() {
  const [activeTab, setActiveTab] = useState<'quickstart' | 'docker' | 'models'>('quickstart')
  const [copied, setCopied] = useState(false)

  const commands = {
    quickstart: `# Clone and run with one command\ngit clone https://github.com/dev-Aarish/gist.git\ncd gist && ./start.sh`,
    docker: `# Run with Docker Compose\ngit clone https://github.com/dev-Aarish/gist.git\ncd gist && docker compose up -d`,
    models: `# Pull your preferred local model with Ollama\nollama pull qwen2.5:7b      # Fast & highly capable (Recommended)\nollama pull llama3.2:3b     # Ultra-light for older laptops`,
  }

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(commands[activeTab])
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {
      // fallback
    }
  }

  return (
    <div className="landing-terminal-wrapper">
      <div className="landing-terminal-header">
        <div className="landing-terminal-dots" aria-hidden="true">
          <span className="landing-terminal-dot dot-red" />
          <span className="landing-terminal-dot dot-yellow" />
          <span className="landing-terminal-dot dot-green" />
        </div>

        <div className="landing-terminal-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'quickstart'}
            className={`landing-term-tab ${activeTab === 'quickstart' ? 'active' : ''}`}
            onClick={() => setActiveTab('quickstart')}
          >
            <Play size={12} strokeWidth={2} />
            <span>1-Line Setup</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'models'}
            className={`landing-term-tab ${activeTab === 'models' ? 'active' : ''}`}
            onClick={() => setActiveTab('models')}
          >
            <Cpu size={12} strokeWidth={2} />
            <span>Local Models</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'docker'}
            className={`landing-term-tab ${activeTab === 'docker' ? 'active' : ''}`}
            onClick={() => setActiveTab('docker')}
          >
            <Terminal size={12} strokeWidth={2} />
            <span>Docker</span>
          </button>
        </div>

        <button
          type="button"
          className="landing-copy-btn"
          onClick={copyToClipboard}
          aria-label={copied ? 'Copied command to clipboard' : 'Copy command'}
        >
          {copied ? (
            <>
              <Check size={13} className="copy-icon-success" strokeWidth={2.5} />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy size={13} strokeWidth={2} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      <div className="landing-terminal-body">
        <pre className="landing-terminal-code">
          <code>
            {commands[activeTab].split('\n').map((line, idx) => {
              const isComment = line.startsWith('#')
              return (
                <div key={idx} className={`term-line ${isComment ? 'term-comment' : 'term-exec'}`}>
                  {!isComment ? <span className="term-prompt">$</span> : null}
                  <span className="term-text">{line}</span>
                </div>
              )
            })}
          </code>
        </pre>
      </div>

      <div className="landing-terminal-footer">
        <div className="term-footer-item">
          <ShieldCheck size={14} className="term-icon-shield" />
          <span>Requires Ollama or LM Studio · No API keys needed</span>
        </div>
        <div className="term-footer-item mono">
          <span>macOS / Linux / Windows WSL2</span>
        </div>
      </div>
    </div>
  )
}
