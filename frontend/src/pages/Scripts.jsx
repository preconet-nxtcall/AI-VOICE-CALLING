import { useEffect, useMemo, useState } from 'react';
import { Bot, Languages, Mic, PhoneForwarded, Tags, Plus, X, Save, Play, User, UserCheck, Trash2, Pencil } from 'lucide-react';
import api from '../services/api';

const PRIMARY_LANGUAGES = ['English', 'Hindi'];
const SECONDARY_LANGUAGES = ['None', 'English', 'Hindi'];
const E164_RE = /^\+?[1-9]\d{6,14}$/;

/** Safely parse a script's JSON content — never throws */
function safeParseContent(raw) {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

export default function Scripts() {
  const [scriptName, setScriptName]             = useState('');
  const [welcomeMessage, setWelcomeMessage]     = useState('');
  const [scriptText, setScriptText]             = useState('');
  const [primaryLanguage, setPrimaryLanguage]   = useState('Hindi');
  const [secondaryLanguage, setSecondaryLanguage] = useState('English');
  const [voiceStyle, setVoiceStyle]             = useState('female');

  const [forwardToHuman, setForwardToHuman]     = useState(false);
  const [handoffNumber, setHandoffNumber]       = useState('');
  const [leadCaptureEnabled, setLeadCaptureEnabled] = useState(true);

  const [tagInput, setTagInput]   = useState('');
  const [leadTags, setLeadTags]   = useState(['interested', 'follow_up', 'not_interested']);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError]     = useState(false);
  const [saving, setSaving]           = useState(false);
  const [scripts, setScripts]         = useState([]);
  const [loadingScripts, setLoadingScripts] = useState(false);

  // Track which script we are editing (null = creating new)
  const [editingScriptId, setEditingScriptId] = useState(null);

  // Delete confirmation state
  const [deletingId, setDeletingId]     = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const isValid = useMemo(() => {
    if (!scriptName.trim() || !scriptText.trim()) return false;
    if (forwardToHuman && !handoffNumber.trim()) return false;
    if (forwardToHuman && !E164_RE.test(handoffNumber.replace(/\s+/g, ''))) return false;
    return true;
  }, [scriptName, scriptText, forwardToHuman, handoffNumber]);

  const addTag = () => {
    const cleaned = tagInput.trim().toLowerCase().replace(/\s+/g, '_');
    if (!cleaned) return;
    if (leadTags.includes(cleaned)) { setTagInput(''); return; }
    setLeadTags((prev) => [...prev, cleaned]);
    setTagInput('');
  };

  const removeTag = (tag) => setLeadTags((prev) => prev.filter((t) => t !== tag));

  /** Reset form to blank / new-script state */
  const resetForm = () => {
    setEditingScriptId(null);
    setScriptName('');
    setWelcomeMessage('');
    setScriptText('');
    setPrimaryLanguage('Hindi');
    setSecondaryLanguage('English');
    setVoiceStyle('female');
    setForwardToHuman(false);
    setHandoffNumber('');
    setLeadCaptureEnabled(true);
    setLeadTags(['interested', 'follow_up', 'not_interested']);
    setSaveMessage('');
    setSaveError(false);
  };

  /** Load an existing script into the form for editing */
  const loadScriptIntoForm = (script) => {
    setEditingScriptId(script.id);
    setScriptName(script.name);
    const cfg = safeParseContent(script.content);
    setWelcomeMessage(cfg.welcome_message || '');
    setScriptText(cfg.prompt || '');
    setPrimaryLanguage(cfg.primary_language || 'Hindi');
    setSecondaryLanguage(cfg.secondary_language || 'None');
    setVoiceStyle(cfg.voice_style || 'female');
    if (cfg.handoff_number) {
      setForwardToHuman(true);
      setHandoffNumber(cfg.handoff_number);
    } else {
      setForwardToHuman(false);
      setHandoffNumber('');
    }
    setLeadCaptureEnabled(!!cfg.lead_capture_enabled);
    setLeadTags(cfg.lead_tags || []);
    setSaveMessage('');
    setSaveError(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /** Build the payload object used for both create and update */
  const buildPayload = () => ({
    name: scriptName.trim(),
    content: JSON.stringify({
      welcome_message: welcomeMessage.trim(),
      prompt: scriptText.trim(),
      primary_language: primaryLanguage,
      secondary_language: secondaryLanguage === 'None' ? null : secondaryLanguage,
      voice_style: voiceStyle.toLowerCase(),
      handoff_number: forwardToHuman ? handoffNumber.replace(/\s+/g, '') : null,
      lead_capture_enabled: leadCaptureEnabled,
      lead_tags: leadCaptureEnabled ? leadTags : [],
    }, null, 2),
  });

  const handleSave = (e) => {
    e.preventDefault();
    if (!isValid) return;

    const run = async () => {
      try {
        setSaving(true);
        setSaveError(false);

        if (editingScriptId) {
          // ── UPDATE existing script ────────────────────────────────────
          await api.put(`/scripts/${editingScriptId}`, buildPayload());
          setSaveMessage('Script updated successfully!');
        } else {
          // ── CREATE new script ─────────────────────────────────────────
          await api.post('/scripts', buildPayload());
          setSaveMessage('Script created successfully!');
        }

        resetForm();
        fetchScripts();
      } catch (err) {
        setSaveError(true);
        setSaveMessage(err?.response?.data?.error || 'Failed to save script.');
      } finally {
        setSaving(false);
        setTimeout(() => setSaveMessage(''), 4000);
      }
    };
    run();
  };

  /** Initiate delete flow — show inline confirm */
  const startDelete = (id) => {
    setDeletingId(id);
    setDeleteConfirm(true);
  };

  /** Confirmed — send DELETE request */
  const confirmDelete = async () => {
    if (!deletingId) return;
    try {
      await api.delete(`/scripts/${deletingId}`);
      // If we were editing this script, clear the form
      if (editingScriptId === deletingId) resetForm();
      fetchScripts();
    } catch (err) {
      alert(err?.response?.data?.error || 'Failed to delete script.');
    } finally {
      setDeletingId(null);
      setDeleteConfirm(false);
    }
  };

  const fetchScripts = async () => {
    try {
      setLoadingScripts(true);
      const res = await api.get('/scripts');
      setScripts(res.data.scripts || []);
    } catch {
      setScripts([]);
    } finally {
      setLoadingScripts(false);
    }
  };

  useEffect(() => { fetchScripts(); }, []);

  const isEditing = !!editingScriptId;

  return (
    <div className="max-w-7xl mx-auto p-6 flex flex-col gap-8">
      <header>
        <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">AI Agent Configuration</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2 text-lg">Define how your AI assistant speaks, behaves, and handles leads.</p>
      </header>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center space-y-4 border border-slate-200 dark:border-slate-700">
            <div className="p-4 bg-red-100 dark:bg-red-900/20 rounded-full w-16 h-16 flex items-center justify-center mx-auto">
              <Trash2 className="text-red-600" size={28} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Delete Script?</h3>
            <p className="text-slate-500 text-sm">This action cannot be undone. The script will be permanently removed.</p>
            <div className="flex gap-3 justify-center mt-2">
              <button
                onClick={() => { setDeleteConfirm(false); setDeletingId(null); }}
                className="px-5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold transition-all shadow-lg shadow-red-500/20"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Script Details */}
        <div className="lg:col-span-8 space-y-6">
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-xl">
            <div className="flex items-center gap-3 mb-8">
              <div className={`p-3 rounded-xl ${isEditing ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-indigo-100 dark:bg-indigo-900/30'}`}>
                {isEditing
                  ? <Pencil className="text-amber-600 dark:text-amber-400" size={24} />
                  : <Bot className="text-indigo-600 dark:text-indigo-400" size={24} />}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                  {isEditing ? 'Edit AI Script' : 'New AI Script'}
                </h2>
                {isEditing && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-0.5">Editing existing agent — changes will update the version</p>
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Agent/Script Name</label>
                <input
                  id="script-name"
                  value={scriptName}
                  onChange={(e) => setScriptName(e.target.value)}
                  placeholder="e.g. Real Estate Lead Qualifier"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-lg focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Welcome Message <span className="font-normal text-slate-400">(First thing the AI says)</span>
                </label>
                <textarea
                  id="welcome-message"
                  value={welcomeMessage}
                  onChange={(e) => setWelcomeMessage(e.target.value)}
                  rows={2}
                  placeholder="Namaste, main aapke inquiry ke baare mein baat karna chahta tha..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                />
                {!welcomeMessage.trim() && (
                  <p className="text-xs text-amber-600 mt-1">⚠ No welcome message — the AI will start the call in silence.</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Primary Language</label>
                  <div className="relative">
                    <Languages className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <select
                      id="primary-language"
                      value={primaryLanguage}
                      onChange={(e) => setPrimaryLanguage(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-12 pr-4 py-3 appearance-none focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      {PRIMARY_LANGUAGES.map((lang) => <option key={lang} value={lang}>{lang}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Secondary Language</label>
                  <div className="relative">
                    <Languages className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <select
                      id="secondary-language"
                      value={secondaryLanguage}
                      onChange={(e) => setSecondaryLanguage(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-12 pr-4 py-3 appearance-none focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      {SECONDARY_LANGUAGES.map((lang) => <option key={lang} value={lang}>{lang}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Voice Selection</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { value: 'female', label: 'Female Voice', sub: 'Soft & Professional', Icon: User },
                    { value: 'male',   label: 'Male Voice',   sub: 'Deep & Authoritative', Icon: UserCheck },
                  ].map(({ value, label, sub, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setVoiceStyle(value)}
                      className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${
                        voiceStyle === value
                          ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20'
                          : 'border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-lg ${voiceStyle === value ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-800'}`}>
                          <Icon size={20} />
                        </div>
                        <div className="text-left">
                          <p className="font-bold">{label}</p>
                          <p className="text-xs text-slate-500">{sub}</p>
                        </div>
                      </div>
                      <Play size={18} className="text-slate-400" />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  AI Instructions & System Prompt <span className="font-normal text-slate-400">(Required)</span>
                </label>
                <textarea
                  id="script-prompt"
                  value={scriptText}
                  onChange={(e) => setScriptText(e.target.value)}
                  rows={8}
                  placeholder="Tell the AI how to behave, what questions to ask, and how to handle objections...&#10;&#10;Example:&#10;You are a sales agent for XYZ Realty. Your goal is to qualify leads for property in Mumbai.&#10;Ask: Budget range? Timeline? Number of BHK needed?&#10;If interested, offer a free site visit."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 transition-all outline-none font-mono text-sm"
                />
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Automation & Tags */}
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Call Automation</h3>

            <div className="space-y-4">
              {/* Human Handoff */}
              <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="font-semibold flex items-center gap-2">
                    <PhoneForwarded size={18} className="text-indigo-500" /> Human Handoff
                  </span>
                  <input
                    type="checkbox"
                    id="handoff-toggle"
                    className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    checked={forwardToHuman}
                    onChange={(e) => setForwardToHuman(e.target.checked)}
                  />
                </label>
                {forwardToHuman && (
                  <div className="mt-4">
                    <p className="text-xs text-slate-500 mb-1">Transfer call when lead asks for agent</p>
                    <input
                      id="handoff-number"
                      value={handoffNumber}
                      onChange={(e) => setHandoffNumber(e.target.value)}
                      placeholder="+91 99999 99999"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
                    />
                    {handoffNumber && !E164_RE.test(handoffNumber.replace(/\s+/g, '')) && (
                      <p className="text-xs text-red-500 mt-1">Enter a valid number (e.g. +91 99999 99999)</p>
                    )}
                  </div>
                )}
              </div>

              {/* Lead Capture */}
              <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="font-semibold flex items-center gap-2">
                    <Tags size={18} className="text-indigo-500" /> Lead Capture
                  </span>
                  <input
                    type="checkbox"
                    id="lead-capture-toggle"
                    className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    checked={leadCaptureEnabled}
                    onChange={(e) => setLeadCaptureEnabled(e.target.checked)}
                  />
                </label>
                {leadCaptureEnabled && (
                  <div className="mt-4 space-y-3">
                    <div className="flex gap-2">
                      <input
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' ? (e.preventDefault(), addTag()) : null}
                        placeholder="e.g. hot_lead"
                        className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
                      />
                      <button type="button" onClick={addTag} className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
                        <Plus size={18} />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {leadTags.map((tag) => (
                        <span key={tag} className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-medium">
                          {tag}
                          <button type="button" onClick={() => removeTag(tag)} className="hover:text-indigo-900"><X size={14} /></button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                type="submit"
                disabled={!isValid || saving}
                className={`w-full text-white rounded-xl px-6 py-4 font-bold text-lg flex items-center justify-center gap-3 shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                  isEditing
                    ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20'
                    : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20'
                }`}
              >
                <Save size={20} />
                {saving
                  ? (isEditing ? 'Updating...' : 'Creating...')
                  : (isEditing ? 'Update Script' : 'Create Script')}
              </button>

              {isEditing && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="w-full rounded-xl px-6 py-3 font-semibold text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                >
                  Cancel — Create New Instead
                </button>
              )}
            </div>

            {saveMessage && (
              <div className={`p-4 rounded-xl text-center text-sm font-medium ${saveError ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'}`}>
                {saveMessage}
              </div>
            )}
          </section>
        </div>
      </form>

      {/* List of Saved Scripts */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-xl">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Active Agents</h2>
          <span className="px-4 py-1 bg-slate-100 dark:bg-slate-800 rounded-full text-sm font-medium text-slate-500">{scripts.length} Total</span>
        </div>

        {loadingScripts ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : scripts.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
            <Bot size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-500">No agents configured yet. Create your first script above.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {scripts.map((s) => {
              const cfg = safeParseContent(s.content);   // ← safe parse, never crashes
              const isCurrentlyEditing = editingScriptId === s.id;
              return (
                <div
                  key={s.id}
                  className={`group relative bg-white dark:bg-slate-950 border rounded-2xl p-6 transition-all shadow-sm ${
                    isCurrentlyEditing
                      ? 'border-amber-400 shadow-amber-200 dark:shadow-amber-900/20 ring-2 ring-amber-300'
                      : 'border-slate-200 dark:border-slate-800 hover:border-indigo-500 hover:shadow-xl'
                  }`}
                >
                  {isCurrentlyEditing && (
                    <div className="absolute -top-2 left-4 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      EDITING
                    </div>
                  )}
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-3 rounded-xl transition-colors ${isCurrentlyEditing ? 'bg-amber-100 dark:bg-amber-900/20' : 'bg-indigo-50 dark:bg-indigo-900/20 group-hover:bg-indigo-600'}`}>
                      <Bot className={`${isCurrentlyEditing ? 'text-amber-600' : 'text-indigo-600 dark:text-indigo-400 group-hover:text-white'}`} size={20} />
                    </div>
                    <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400">v{s.version}</span>
                  </div>

                  <h3 className="font-bold text-slate-900 dark:text-white text-lg line-clamp-1">{s.name}</h3>

                  {/* Welcome message preview */}
                  {cfg.welcome_message ? (
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2 italic">"{cfg.welcome_message}"</p>
                  ) : (
                    <p className="text-xs text-amber-500 mt-1">⚠ No welcome message</p>
                  )}

                  <div className="mt-4 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Languages size={12} /> {cfg.primary_language || '—'}{cfg.secondary_language ? ` + ${cfg.secondary_language}` : ''}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Mic size={12} /> {cfg.voice_style ? cfg.voice_style.charAt(0).toUpperCase() + cfg.voice_style.slice(1) : '—'} Voice
                    </div>
                    {cfg.handoff_number && (
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <PhoneForwarded size={12} /> Handoff: {cfg.handoff_number}
                      </div>
                    )}
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <p className="text-[10px] text-slate-400">Created {new Date(s.created_at).toLocaleDateString()}</p>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => loadScriptIntoForm(s)}
                        className="text-indigo-600 dark:text-indigo-400 font-bold text-xs hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => startDelete(s.id)}
                        className="text-red-500 hover:text-red-700 transition-colors"
                        title="Delete script"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
