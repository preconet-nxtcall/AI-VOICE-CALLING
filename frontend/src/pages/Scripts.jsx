import { useEffect, useMemo, useState } from 'react';
import { Bot, Languages, Mic, PhoneForwarded, Tags, Plus, X, Save, Play, User, UserCheck } from 'lucide-react';
import api from '../services/api';

const PRIMARY_LANGUAGES = ['English', 'Hindi', 'Bengali', 'Spanish', 'French', 'German', 'Chinese', 'Japanese', 'Arabic', 'Russian', 'Portuguese', 'Auto-Detect'];
const SECONDARY_LANGUAGES = ['None', 'English', 'Hindi', 'Bengali', 'Spanish', 'French', 'German', 'Chinese', 'Japanese', 'Arabic', 'Russian', 'Portuguese'];
const E164_RE = /^\+?[1-9]\d{6,14}$/;

export default function Scripts() {
  const [scriptName, setScriptName] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [scriptText, setScriptText] = useState('');
  const [primaryLanguage, setPrimaryLanguage] = useState('Hindi');
  const [secondaryLanguage, setSecondaryLanguage] = useState('English');
  const [voiceStyle, setVoiceStyle] = useState('female');

  const [forwardToHuman, setForwardToHuman] = useState(false);
  const [handoffNumber, setHandoffNumber] = useState('');
  const [leadCaptureEnabled, setLeadCaptureEnabled] = useState(true);

  const [tagInput, setTagInput] = useState('');
  const [leadTags, setLeadTags] = useState(['interested', 'follow_up', 'not_interested']);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scripts, setScripts] = useState([]);
  const [loadingScripts, setLoadingScripts] = useState(false);

  const isValid = useMemo(() => {
    if (!scriptName.trim() || !scriptText.trim()) return false;
    if (forwardToHuman && !handoffNumber.trim()) return false;
    if (forwardToHuman && !E164_RE.test(handoffNumber.trim())) return false;
    return true;
  }, [scriptName, scriptText, forwardToHuman, handoffNumber]);

  const addTag = () => {
    const cleaned = tagInput.trim().toLowerCase().replace(/\s+/g, '_');
    if (!cleaned) return;
    if (leadTags.includes(cleaned)) {
      setTagInput('');
      return;
    }
    setLeadTags((prev) => [...prev, cleaned]);
    setTagInput('');
  };

  const removeTag = (tag) => {
    setLeadTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (!isValid) return;

    const payload = {
      name: scriptName.trim(),
      content: JSON.stringify(
        {
          welcome_message: welcomeMessage.trim(),
          prompt: scriptText.trim(),
          primary_language: primaryLanguage,
          secondary_language: secondaryLanguage === 'None' ? null : secondaryLanguage,
          voice_style: voiceStyle.toLowerCase(),
          handoff_number: forwardToHuman ? handoffNumber.trim() : null,
          lead_capture_enabled: leadCaptureEnabled,
          lead_tags: leadCaptureEnabled ? leadTags : [],
        },
        null,
        2
      ),
    };

    const save = async () => {
      try {
        setSaving(true);
        setSaveError(false);
        await api.post('/scripts', payload);
        setSaveMessage('Script created successfully.');
        setScriptName('');
        setWelcomeMessage('');
        setScriptText('');
        setHandoffNumber('');
        setForwardToHuman(false);
        setLeadCaptureEnabled(true);
        setLeadTags(['interested', 'follow_up', 'not_interested']);
        fetchScripts();
      } catch (err) {
        setSaveError(true);
        setSaveMessage(err?.response?.data?.error || 'Failed to save script.');
      } finally {
        setSaving(false);
        setTimeout(() => setSaveMessage(''), 3000);
      }
    };
    save();
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

  useEffect(() => {
    fetchScripts();
  }, []);

  return (
    <div className="max-w-7xl mx-auto p-6 flex flex-col gap-8">
      <header>
        <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">AI Agent Configuration</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2 text-lg">Define how your AI assistant speaks, behaves, and handles leads.</p>
      </header>

      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Script Details */}
        <div className="lg:col-span-8 space-y-6">
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-xl">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
                <Bot className="text-indigo-600 dark:text-indigo-400" size={24} />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">New AI Script</h2>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Agent/Script Name</label>
                <input
                  value={scriptName}
                  onChange={(e) => setScriptName(e.target.value)}
                  placeholder="e.g. Real Estate Lead Qualifier"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-lg focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Welcome Message (Opening Sentence)</label>
                <textarea
                  value={welcomeMessage}
                  onChange={(e) => setWelcomeMessage(e.target.value)}
                  rows={2}
                  placeholder="Namaste, I am calling from Brandmo regarding your inquiry..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Primary Language</label>
                  <div className="relative">
                    <Languages className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <select
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
                  <button
                    type="button"
                    onClick={() => setVoiceStyle('female')}
                    className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${
                      voiceStyle === 'female'
                        ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20'
                        : 'border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg ${voiceStyle === 'female' ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-800'}`}>
                        <User size={20} />
                      </div>
                      <div className="text-left">
                        <p className="font-bold">Female Voice</p>
                        <p className="text-xs text-slate-500">Soft & Professional</p>
                      </div>
                    </div>
                    <Play size={18} className="text-slate-400" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setVoiceStyle('male')}
                    className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${
                      voiceStyle === 'male'
                        ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20'
                        : 'border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg ${voiceStyle === 'male' ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-800'}`}>
                        <UserCheck size={20} />
                      </div>
                      <div className="text-left">
                        <p className="font-bold">Male Voice</p>
                        <p className="text-xs text-slate-500">Deep & Authoritative</p>
                      </div>
                    </div>
                    <Play size={18} className="text-slate-400" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">AI Instructions & System Prompt</label>
                <textarea
                  value={scriptText}
                  onChange={(e) => setScriptText(e.target.value)}
                  rows={8}
                  placeholder="Tell the AI how to behave, what questions to ask, and how to handle objections..."
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
              <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="font-semibold flex items-center gap-2">
                    <PhoneForwarded size={18} className="text-indigo-500" /> Human Handoff
                  </span>
                  <input
                    type="checkbox"
                    className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    checked={forwardToHuman}
                    onChange={(e) => setForwardToHuman(e.target.checked)}
                  />
                </label>
                {forwardToHuman && (
                  <div className="mt-4 animate-in fade-in slide-in-from-top-2">
                    <p className="text-xs text-slate-500 mb-1">Transfer call when lead asks for agent</p>
                    <input
                      value={handoffNumber}
                      onChange={(e) => setHandoffNumber(e.target.value)}
                      placeholder="+91 99999 99999"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
                    />
                  </div>
                )}
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="font-semibold flex items-center gap-2">
                    <Tags size={18} className="text-indigo-500" /> Lead Capture
                  </span>
                  <input
                    type="checkbox"
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

            <button
              type="submit"
              disabled={!isValid || saving}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white rounded-xl px-6 py-4 font-bold text-lg flex items-center justify-center gap-3 shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
            >
              <Save size={20} /> {saving ? 'Creating Agent...' : 'Create Script'}
            </button>

            {saveMessage && (
              <div className={`p-4 rounded-xl text-center text-sm font-medium ${saveError ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
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
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : scripts.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
            <Bot size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-500">No agents configured yet. Create your first script above.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {scripts.map((s) => {
              const cfg = JSON.parse(s.content || '{}');
              return (
                <div key={s.id} className="group relative bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 hover:border-indigo-500 transition-all shadow-sm hover:shadow-xl">
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl group-hover:bg-indigo-600 transition-colors">
                      <Bot className="text-indigo-600 dark:text-indigo-400 group-hover:text-white" size={20} />
                    </div>
                    <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400">v{s.version}</span>
                  </div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-lg line-clamp-1">{s.name}</h3>
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Languages size={12} /> {cfg.primary_language}{cfg.secondary_language ? ` + ${cfg.secondary_language}` : ''}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Mic size={12} /> {cfg.voice_style?.charAt(0).toUpperCase() + cfg.voice_style?.slice(1)} Voice
                    </div>
                  </div>
                  <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <p className="text-[10px] text-slate-400">Created {new Date(s.created_at).toLocaleDateString()}</p>
                    <button className="text-indigo-600 dark:text-indigo-400 font-bold text-xs hover:underline">Edit Script</button>
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
