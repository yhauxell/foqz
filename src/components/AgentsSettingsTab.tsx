import React, { useState } from 'react'
import {
  Sparkles,
  Plus,
  Trash2,
  Edit3,
  RotateCcw,
  Check,
  Code,
  Terminal,
  FileText,
  Upload,
} from 'lucide-react'
import {
  BUILTIN_AGENT_PROFILES,
  BUILTIN_CUSTOM_SKILLS,
  parseAgentMarkdown,
  parseSkillMarkdown,
  type AgentProfile,
  type CustomSkill,
} from '@/lib/agentProfiles'
import { useFocusAppSettings } from '@/context/FocusAppSettingsContext'
import { patchCachedAppSettings } from '@/lib/appSettingsCache'

export function AgentsSettingsTab() {
  const { settings, update } = useFocusAppSettings()

  const profiles = settings.agentProfiles && settings.agentProfiles.length > 0
    ? settings.agentProfiles
    : BUILTIN_AGENT_PROFILES

  const skills = settings.customSkills && settings.customSkills.length > 0
    ? settings.customSkills
    : BUILTIN_CUSTOM_SKILLS

  const [activeSubTab, setActiveSubTab] = useState<'profiles' | 'skills'>('profiles')
  const [editingProfile, setEditingProfile] = useState<AgentProfile | null>(null)
  const [editingSkill, setEditingSkill] = useState<CustomSkill | null>(null)
  const [isNew, setIsNew] = useState(false)

  const handleSaveProfile = () => {
    if (!editingProfile) return
    let updated: AgentProfile[]
    if (isNew) {
      updated = [...profiles, editingProfile]
    } else {
      updated = profiles.map((p) => (p.id === editingProfile.id ? editingProfile : p))
    }
    update({ agentProfiles: updated })
    patchCachedAppSettings({ agentProfiles: updated })
    setEditingProfile(null)
    setIsNew(false)
  }

  const handleDeleteProfile = (id: string) => {
    const updated = profiles.filter((p) => p.id !== id)
    update({ agentProfiles: updated })
    patchCachedAppSettings({ agentProfiles: updated })
  }

  const handleSaveSkill = () => {
    if (!editingSkill) return
    let updated: CustomSkill[]
    if (isNew) {
      updated = [...skills, editingSkill]
    } else {
      updated = skills.map((s) => (s.id === editingSkill.id ? editingSkill : s))
    }
    update({ customSkills: updated })
    patchCachedAppSettings({ customSkills: updated })
    setEditingSkill(null)
    setIsNew(false)
  }

  const handleDeleteSkill = (id: string) => {
    const updated = skills.filter((s) => s.id !== id)
    update({ customSkills: updated })
    patchCachedAppSettings({ customSkills: updated })
  }

  const handleResetDefaults = () => {
    update({
      agentProfiles: BUILTIN_AGENT_PROFILES,
      customSkills: BUILTIN_CUSTOM_SKILLS,
    })
    patchCachedAppSettings({
      agentProfiles: BUILTIN_AGENT_PROFILES,
      customSkills: BUILTIN_CUSTOM_SKILLS,
    })
  }

  const handleImportAgentFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      const text = String(evt.target?.result || '')
      if (text.trim()) {
        const parsed = parseAgentMarkdown(text, `imported-${Date.now()}`)
        setEditingProfile(parsed)
        setIsNew(true)
      }
    }
    reader.readAsText(file)
  }

  const handleImportSkillFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      const text = String(evt.target?.result || '')
      if (text.trim()) {
        const parsed = parseSkillMarkdown(text, `imported-${Date.now()}`)
        setEditingSkill(parsed)
        setIsNew(true)
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="space-y-6 text-sm">
      {/* Tab Header & Quick Actions */}
      <div className="flex items-center justify-between border-b border-border/50 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveSubTab('profiles')
              setEditingProfile(null)
              setEditingSkill(null)
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'profiles'
                ? 'bg-primary/15 text-primary border border-primary/30'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sparkles className="size-3.5" />
            <span>Agent Profiles ({profiles.length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveSubTab('skills')
              setEditingProfile(null)
              setEditingSkill(null)
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'skills'
                ? 'bg-primary/15 text-primary border border-primary/30'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Terminal className="size-3.5" />
            <span>Custom Skills ({skills.length})</span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleResetDefaults}
          title="Reset built-in presets to defaults"
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors cursor-pointer"
        >
          <RotateCcw className="size-3" />
          <span>Reset Presets</span>
        </button>
      </div>

      {/* PROFILES TAB */}
      {activeSubTab === 'profiles' && (
        <div className="space-y-4">
          {!editingProfile ? (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Define specialized AI behavioral profiles using standard AGENT.md markdown format.
                </p>
                <div className="flex items-center gap-2">
                  <label className="px-2.5 py-1 rounded-lg border border-border bg-card hover:bg-accent text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                    <Upload className="size-3.5" />
                    <span>Import AGENT.md</span>
                    <input type="file" accept=".md" onChange={handleImportAgentFile} className="hidden" />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsNew(true)
                      setEditingProfile({
                        id: `agent-${Date.now()}`,
                        name: 'New Agent',
                        role: 'Specialized Persona',
                        instructions: 'System prompt instructions for this agent persona...',
                        avatar: '🤖',
                      })
                    }}
                    className="px-3 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-medium flex items-center gap-1.5 hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    <Plus className="size-3.5" />
                    <span>New Profile</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {profiles.map((p) => (
                  <div
                    key={p.id}
                    className="p-3.5 rounded-xl border border-border/80 bg-card/60 space-y-2 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-semibold text-foreground">
                          <span className="text-base">{p.avatar || '🤖'}</span>
                          <span>{p.name}</span>
                        </div>
                        {p.isPreset && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground font-mono">
                            Preset
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-medium text-primary mt-1">{p.role}</div>
                      <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                        {p.instructions}
                      </p>
                    </div>

                    <div className="flex items-center justify-end gap-2 border-t border-border/40 pt-2.5 mt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsNew(false)
                          setEditingProfile({ ...p })
                        }}
                        className="p-1 rounded text-muted-foreground hover:text-foreground cursor-pointer"
                        title="Edit profile"
                      >
                        <Edit3 className="size-3.5" />
                      </button>
                      {!p.isPreset && (
                        <button
                          type="button"
                          onClick={() => handleDeleteProfile(p.id)}
                          className="p-1 rounded text-rose-500 hover:text-rose-600 cursor-pointer"
                          title="Delete profile"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            /* AGENT PROFILE EDITOR */
            <div className="space-y-4 bg-muted/20 p-4 rounded-xl border border-border">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <span className="font-semibold text-sm">
                  {isNew ? 'Create New AGENT.md Profile' : `Edit Agent: ${editingProfile.name}`}
                </span>
                <button
                  type="button"
                  onClick={() => setEditingProfile(null)}
                  className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Avatar Emoji</label>
                  <input
                    type="text"
                    value={editingProfile.avatar || '🤖'}
                    onChange={(e) => setEditingProfile({ ...editingProfile, avatar: e.target.value })}
                    className="w-full h-8 px-2 rounded-lg border border-border bg-background text-xs"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Agent Name</label>
                  <input
                    type="text"
                    value={editingProfile.name}
                    onChange={(e) => setEditingProfile({ ...editingProfile, name: e.target.value })}
                    className="w-full h-8 px-2 rounded-lg border border-border bg-background text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Role / Persona Title</label>
                <input
                  type="text"
                  value={editingProfile.role || ''}
                  onChange={(e) => setEditingProfile({ ...editingProfile, role: e.target.value })}
                  placeholder="e.g. Senior Software Architect"
                  className="w-full h-8 px-2 rounded-lg border border-border bg-background text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  System Instructions (AGENT.md body)
                </label>
                <textarea
                  rows={6}
                  value={editingProfile.instructions}
                  onChange={(e) => setEditingProfile({ ...editingProfile, instructions: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-border bg-background font-mono text-xs text-foreground focus:outline-none"
                  placeholder="Enter custom behavioral prompt, constraints, and instructions..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 cursor-pointer"
                >
                  Save Profile
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SKILLS TAB */}
      {activeSubTab === 'skills' && (
        <div className="space-y-4">
          {!editingSkill ? (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Create slash command trigger skills with dynamic placeholders (<code>{"{{selection}}"}</code>, <code>{"{{project}}"}</code>, <code>{"{{args}}"}</code>).
                </p>
                <div className="flex items-center gap-2">
                  <label className="px-2.5 py-1 rounded-lg border border-border bg-card hover:bg-accent text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                    <Upload className="size-3.5" />
                    <span>Import SKILL.md</span>
                    <input type="file" accept=".md" onChange={handleImportSkillFile} className="hidden" />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsNew(true)
                      setEditingSkill({
                        id: `skill-${Date.now()}`,
                        name: 'New Skill',
                        slashCommand: '/myskill',
                        description: 'Custom execution skill',
                        promptTemplate: 'Execute custom analysis for: {{selection}}',
                        autoExecute: true,
                      })
                    }}
                    className="px-3 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-medium flex items-center gap-1.5 hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    <Plus className="size-3.5" />
                    <span>New Skill</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {skills.map((s) => (
                  <div
                    key={s.id}
                    className="p-3.5 rounded-xl border border-border/80 bg-card/60 space-y-2 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="font-mono font-bold text-xs text-amber-600 dark:text-amber-400">
                          {s.slashCommand}
                        </div>
                        {s.isPreset && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground font-mono">
                            Preset
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-semibold text-foreground mt-1">{s.name}</div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {s.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-end gap-2 border-t border-border/40 pt-2.5 mt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsNew(false)
                          setEditingSkill({ ...s })
                        }}
                        className="p-1 rounded text-muted-foreground hover:text-foreground cursor-pointer"
                        title="Edit skill"
                      >
                        <Edit3 className="size-3.5" />
                      </button>
                      {!s.isPreset && (
                        <button
                          type="button"
                          onClick={() => handleDeleteSkill(s.id)}
                          className="p-1 rounded text-rose-500 hover:text-rose-600 cursor-pointer"
                          title="Delete skill"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            /* SKILL EDITOR */
            <div className="space-y-4 bg-muted/20 p-4 rounded-xl border border-border">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <span className="font-semibold text-sm">
                  {isNew ? 'Create New SKILL.md' : `Edit Skill: ${editingSkill.name}`}
                </span>
                <button
                  type="button"
                  onClick={() => setEditingSkill(null)}
                  className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Skill Name</label>
                  <input
                    type="text"
                    value={editingSkill.name}
                    onChange={(e) => setEditingSkill({ ...editingSkill, name: e.target.value })}
                    className="w-full h-8 px-2 rounded-lg border border-border bg-background text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Slash Command</label>
                  <input
                    type="text"
                    value={editingSkill.slashCommand}
                    onChange={(e) => setEditingSkill({ ...editingSkill, slashCommand: e.target.value })}
                    className="w-full h-8 px-2 rounded-lg border border-border bg-background font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Description</label>
                <input
                  type="text"
                  value={editingSkill.description || ''}
                  onChange={(e) => setEditingSkill({ ...editingSkill, description: e.target.value })}
                  className="w-full h-8 px-2 rounded-lg border border-border bg-background text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Prompt Template (SKILL.md body)
                </label>
                <textarea
                  rows={6}
                  value={editingSkill.promptTemplate}
                  onChange={(e) => setEditingSkill({ ...editingSkill, promptTemplate: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-border bg-background font-mono text-xs text-foreground focus:outline-none"
                  placeholder="Prompt template with {{selection}}, {{project}}, {{args}}..."
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingSkill.autoExecute !== false}
                    onChange={(e) => setEditingSkill({ ...editingSkill, autoExecute: e.target.checked })}
                    className="rounded border-border accent-primary"
                  />
                  <span>Auto-execute immediately on slash selection</span>
                </label>
                <button
                  type="button"
                  onClick={handleSaveSkill}
                  className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 cursor-pointer"
                >
                  Save Skill
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
