import { useEffect, useMemo, useRef, useState } from 'react'
import {
  GamePackError,
  MAX_FEUD_ANSWERS,
  MAX_FEUD_QUESTIONS,
  cloneFeudGamePack,
  createBlankFeudGamePack,
  normalizeFeudGamePack,
  parseFeudGamePack,
} from './feudGamePack'
import type { FeudAnswer, FeudGamePack, FeudQuestion } from './roomTypes'

const draftStorageKey = 'wangz.feud-pack-draft.v1'

export function saveFeudGamePackDraft(pack: FeudGamePack) {
  window.localStorage.setItem(draftStorageKey, JSON.stringify(pack))
}

interface FeudGameBuilderProps {
  initialPack: FeudGamePack
  onBack: () => void
  onUsePack: (pack: FeudGamePack) => void
}

function readDraft(): FeudGamePack | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(draftStorageKey) ?? 'null') as unknown
    if (!value || typeof value !== 'object') return null
    const candidate = value as Partial<FeudGamePack>
    if (candidate.version !== 1 || candidate.kind !== 'feud' || !Array.isArray(candidate.questions)) return null
    if (!candidate.questions.every((question) => (
      typeof question === 'object' && question !== null && Array.isArray((question as FeudQuestion).answers)
    ))) return null
    return candidate as FeudGamePack
  } catch {
    return null
  }
}

function packIssues(pack: FeudGamePack): string[] {
  try {
    normalizeFeudGamePack(pack)
    return []
  } catch (cause) {
    return cause instanceof GamePackError ? cause.issues : ['This game pack is not ready yet.']
  }
}

function makeAnswer(points = 10): FeudAnswer {
  return { id: crypto.randomUUID(), label: '', points }
}

function makeQuestion(): FeudQuestion {
  return {
    id: crypto.randomUUID(),
    prompt: '',
    answers: [makeAnswer(40), makeAnswer(25)],
  }
}

function downloadPack(pack: FeudGamePack) {
  const safeName = pack.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'wangz-game-pack'
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(pack, null, 2)}\n`], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${safeName}.json`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function FeudGameBuilder({ initialPack, onBack, onUsePack }: FeudGameBuilderProps) {
  const [pack, setPack] = useState<FeudGamePack>(() => cloneFeudGamePack(readDraft() ?? initialPack))
  const [importError, setImportError] = useState('')
  const [savePulse, setSavePulse] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const issues = useMemo(() => packIssues(pack), [pack])
  const answerCount = pack.questions.reduce((total, question) => total + question.answers.length, 0)

  useEffect(() => {
    saveFeudGamePackDraft(pack)
    setSavePulse(true)
    const timeout = window.setTimeout(() => setSavePulse(false), 900)
    return () => window.clearTimeout(timeout)
  }, [pack])

  const updateQuestion = (questionIndex: number, update: (question: FeudQuestion) => void) => {
    setPack((current) => {
      const next = cloneFeudGamePack(current)
      update(next.questions[questionIndex])
      return next
    })
  }

  const moveQuestion = (questionIndex: number, direction: -1 | 1) => {
    setPack((current) => {
      const next = cloneFeudGamePack(current)
      const destination = questionIndex + direction
      if (destination < 0 || destination >= next.questions.length) return current
      const [question] = next.questions.splice(questionIndex, 1)
      next.questions.splice(destination, 0, question)
      return next
    })
  }

  const duplicateQuestion = (questionIndex: number) => {
    setPack((current) => {
      const next = cloneFeudGamePack(current)
      const source = next.questions[questionIndex]
      next.questions.splice(questionIndex + 1, 0, {
        ...source,
        id: crypto.randomUUID(),
        prompt: `${source.prompt} (copy)`,
        answers: source.answers.map((answer) => ({ ...answer, id: crypto.randomUUID() })),
      })
      return next
    })
  }

  const removeQuestion = (questionIndex: number) => {
    setPack((current) => ({ ...cloneFeudGamePack(current), questions: current.questions.filter((_, index) => index !== questionIndex) }))
  }

  const importFile = async (file: File | undefined) => {
    if (!file) return
    setImportError('')
    try {
      const imported = parseFeudGamePack(await file.text())
      setPack(imported)
    } catch (cause) {
      setImportError(cause instanceof GamePackError ? cause.issues.join(' ') : 'That file could not be opened.')
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const usePack = () => {
    try {
      onUsePack(normalizeFeudGamePack(pack))
    } catch {
      document.querySelector('.builder-validation')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  const exportPack = () => {
    try {
      downloadPack(normalizeFeudGamePack(pack))
    } catch {
      document.querySelector('.builder-validation')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  return (
    <main className="builder-shell">
      <header className="builder-nav">
        <button className="text-button text-button--light" onClick={onBack}>← Game setup</button>
        <div className="builder-wordmark"><span>W</span><b>Wangz</b><small>Game pack workshop</small></div>
        <span className={`builder-save-state ${savePulse ? 'is-saving' : ''}`}><i /> {savePulse ? 'Saving draft' : 'Draft saved here'}</span>
      </header>

      <div className="builder-layout">
        <aside className="builder-manifest">
          <p className="eyebrow">Family Feud builder</p>
          <h1>Make the<br /><em>board yours.</em></h1>
          <p>Write the prompts, rank the answers, then bring one tidy file to game night.</p>

          <div className="manifest-ticket" aria-label={`${pack.questions.length} questions and ${answerCount} answers`}>
            <span>Tonight’s pack</span>
            <strong>{String(pack.questions.length).padStart(2, '0')}</strong>
            <small>questions · {answerCount} answers</small>
          </div>

          <div className="builder-file-actions">
            <button type="button" onClick={() => fileInput.current?.click()}>Import JSON</button>
            <button type="button" onClick={exportPack}>Download JSON</button>
            <input
              ref={fileInput}
              className="sr-only"
              type="file"
              accept="application/json,.json"
              onChange={(event) => void importFile(event.target.files?.[0])}
            />
          </div>
          {importError && <p className="builder-import-error" role="alert">{importError}</p>}
          <button
            className="builder-new-pack"
            type="button"
            onClick={() => {
              if (window.confirm('Start a blank pack? Your current draft will be replaced.')) setPack(createBlankFeudGamePack())
            }}
          >Start a blank pack</button>
        </aside>

        <section className="builder-workbench">
          <div className="pack-title-field">
            <label htmlFor="pack-title">Pack title</label>
            <input
              id="pack-title"
              value={pack.title}
              maxLength={60}
              onChange={(event) => setPack((current) => ({ ...current, title: event.target.value }))}
              placeholder="The Wangz reunion"
            />
            <span>{pack.title.length}/60</span>
          </div>

          <div className="question-stack">
            {pack.questions.map((question, questionIndex) => (
              <details className="builder-question" key={question.id} open={questionIndex === 0}>
                <summary>
                  <span>{String(questionIndex + 1).padStart(2, '0')}</span>
                  <div>
                    <small>Question</small>
                    <strong>{question.prompt || 'Untitled question'}</strong>
                  </div>
                  <b>{question.answers.length} answers</b>
                </summary>

                <div className="builder-question__body">
                  <div className="builder-question__tools">
                    <button type="button" onClick={() => moveQuestion(questionIndex, -1)} disabled={questionIndex === 0} aria-label={`Move question ${questionIndex + 1} up`}>↑</button>
                    <button type="button" onClick={() => moveQuestion(questionIndex, 1)} disabled={questionIndex === pack.questions.length - 1} aria-label={`Move question ${questionIndex + 1} down`}>↓</button>
                    <button type="button" onClick={() => duplicateQuestion(questionIndex)} disabled={pack.questions.length >= MAX_FEUD_QUESTIONS}>Duplicate</button>
                    <button type="button" className="is-danger" onClick={() => removeQuestion(questionIndex)} disabled={pack.questions.length === 1}>Remove</button>
                  </div>

                  <label className="builder-prompt">
                    <span>Read this to the room</span>
                    <textarea
                      value={question.prompt}
                      maxLength={180}
                      rows={2}
                      onChange={(event) => updateQuestion(questionIndex, (draft) => { draft.prompt = event.target.value })}
                      placeholder="Name something people do right before guests arrive."
                    />
                    <small>{question.prompt.length}/180</small>
                  </label>

                  <div className="builder-answer-heading"><span>Board answers</span><b>Points</b></div>
                  <div className="builder-answers">
                    {question.answers.map((answer, answerIndex) => (
                      <div className="builder-answer" key={answer.id}>
                        <span>{answerIndex + 1}</span>
                        <label>
                          <span className="sr-only">Answer {answerIndex + 1}</span>
                          <input
                            value={answer.label}
                            maxLength={60}
                            onChange={(event) => updateQuestion(questionIndex, (draft) => { draft.answers[answerIndex].label = event.target.value })}
                            placeholder="Survey answer"
                          />
                        </label>
                        <label>
                          <span className="sr-only">Answer {answerIndex + 1} points</span>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={answer.points}
                            onChange={(event) => updateQuestion(questionIndex, (draft) => { draft.answers[answerIndex].points = Number(event.target.value) })}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => updateQuestion(questionIndex, (draft) => { draft.answers.splice(answerIndex, 1) })}
                          disabled={question.answers.length === 1}
                          aria-label={`Remove answer ${answerIndex + 1}`}
                        >×</button>
                      </div>
                    ))}
                  </div>
                  <button
                    className="add-answer-button"
                    type="button"
                    disabled={question.answers.length >= MAX_FEUD_ANSWERS}
                    onClick={() => updateQuestion(questionIndex, (draft) => { draft.answers.push(makeAnswer()) })}
                  >+ Add board answer <span>{question.answers.length}/{MAX_FEUD_ANSWERS}</span></button>
                </div>
              </details>
            ))}
          </div>

          <button
            className="add-question-button"
            type="button"
            disabled={pack.questions.length >= MAX_FEUD_QUESTIONS}
            onClick={() => setPack((current) => ({ ...cloneFeudGamePack(current), questions: [...current.questions, makeQuestion()] }))}
          ><span>+</span><strong>Add another question</strong><small>Build the next board</small></button>

          <section className={`builder-validation ${issues.length === 0 ? 'is-ready' : ''}`} aria-live="polite">
            <div>
              <span>{issues.length === 0 ? 'Pack ready' : 'Finish the pack'}</span>
              <strong>{issues.length === 0 ? 'Everything checks out.' : `${issues.length} ${issues.length === 1 ? 'detail needs' : 'details need'} attention.`}</strong>
              {issues.length > 0 && <ul>{issues.slice(0, 5).map((issue) => <li key={issue}>{issue}</li>)}</ul>}
            </div>
            <button type="button" disabled={issues.length > 0} onClick={usePack}>Use this pack →</button>
          </section>
        </section>
      </div>
    </main>
  )
}
