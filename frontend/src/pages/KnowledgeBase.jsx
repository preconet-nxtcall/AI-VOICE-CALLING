import { useState, useEffect, useRef } from 'react';
import { Upload, Link as LinkIcon, FileText, Trash2, Database, Loader2 } from 'lucide-react';
import api from '../services/api';

export default function KnowledgeBase() {
  const [knowledgeBases, setKnowledgeBases] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [urlInput, setUrlInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [processingUrl, setProcessingUrl] = useState(false);
  
  // States for Outbound Call testing
  const [testPhoneNumber, setTestPhoneNumber] = useState('');
  const [calling, setCalling] = useState(false);
  const [callMessage, setCallMessage] = useState('');

  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/knowledge/list');
      // Flatten documents from all knowledge bases for display, or just take the default one.
      const kbs = res.data.knowledge_bases || [];
      setKnowledgeBases(kbs);
      const allDocs = kbs.reduce((acc, kb) => {
        return [...acc, ...(kb.documents || [])];
      }, []);
      setDocuments(allDocs);
    } catch (error) {
      console.error('Failed to fetch documents', error);
      setError(error.response?.data?.error || 'Failed to fetch documents.');
    } finally {
      setLoading(false);
    }
  };

  const fetchJobs = async () => {
    try {
      const res = await api.get('/knowledge/ingestion-jobs');
      setJobs(res.data.ingestion_jobs || []);
    } catch (error) {
      console.error('Failed to fetch ingestion jobs', error);
    }
  };

  useEffect(() => {
    fetchDocuments();
    fetchJobs();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      fetchJobs();
      fetchDocuments();
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploading(true);
      setError('');
      await api.post('/knowledge/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      fetchJobs();
      fetchDocuments();
    } catch (error) {
      console.error('Upload failed', error);
      setError(error.response?.data?.error || 'Upload failed');
      alert(error.response?.data?.error || "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = null;
    }
  };

  const handleAddUrl = async () => {
    if (!urlInput.trim()) return;

    try {
      setProcessingUrl(true);
      setError('');
      await api.post('/knowledge/url', { url: urlInput });
      setUrlInput('');
      fetchJobs();
      fetchDocuments();
    } catch (error) {
      console.error('URL processing failed', error);
      setError(error.response?.data?.error || 'Failed to process URL');
      alert(error.response?.data?.error || "Failed to process URL");
    } finally {
      setProcessingUrl(false);
    }
  };

  const handleDelete = async (docId) => {
    if (!window.confirm("Are you sure you want to delete this document?")) return;

    try {
      await api.delete(`/knowledge/document/${docId}`);
      setError('');
      fetchDocuments();
    } catch (error) {
      console.error('Failed to delete document', error);
      setError(error.response?.data?.error || 'Failed to delete document');
      alert("Failed to delete document");
    }
  };

  const handleTestCall = async () => {
    if (!testPhoneNumber.trim()) {
      alert("Please enter a phone number.");
      return;
    }
    if (knowledgeBases.length === 0) {
      alert("No knowledge base found. Please upload a document first.");
      return;
    }
    
    try {
      setCalling(true);
      setCallMessage('');
      const kbId = knowledgeBases[0].id; // Use the first KB for testing
      
      const res = await api.post('/agent/call', {
        phone_number: testPhoneNumber,
        knowledge_base_id: kbId
      });
      
      setCallMessage(`Success: ${res.data.data?.message || 'Call initiated!'}`);
      setTestPhoneNumber('');
    } catch (error) {
      console.error('Test call failed', error);
      setCallMessage(`Error: ${error.response?.data?.error || 'Failed to initiate call'}`);
    } finally {
      setCalling(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">Knowledge Base</h1>
        <p className="text-slate-400">Manage the data sources your AI agent uses to answer questions.</p>
      </div>
      {error && <div className="text-red-400 text-sm">{error}</div>}

      <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6">
        <h2 className="text-xl font-bold text-white mb-4">Ingestion Queue</h2>
        <div className="space-y-3">
          {jobs.length === 0 ? (
            <p className="text-slate-500 text-sm">No ingestion jobs yet.</p>
          ) : jobs.slice(0, 8).map((job) => (
            <div key={job.id} className="border border-slate-700 rounded-lg p-3 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-slate-200 text-sm truncate">{job.source_name}</p>
                <p className="text-slate-500 text-xs uppercase tracking-wider">{job.source_type}</p>
                {job.error_message && <p className="text-red-400 text-xs mt-1 truncate">{job.error_message}</p>}
              </div>
              <div className="text-right">
                <p className={`text-xs font-semibold uppercase ${
                  job.status === 'completed' ? 'text-emerald-400' :
                  job.status === 'failed' ? 'text-red-400' :
                  job.status === 'processing' ? 'text-amber-400' : 'text-indigo-400'
                }`}>
                  {job.status}
                </p>
                <p className="text-slate-500 text-xs">{new Date(job.created_at).toLocaleTimeString()}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Upload File Section */}
        <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Upload className="text-indigo-400" /> Upload File
          </h2>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileSelect} 
            className="hidden" 
            accept=".pdf,.docx,.txt"
          />
          <div 
            onClick={() => !uploading && fileInputRef.current?.click()}
            className={`border-2 border-dashed border-slate-700 rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all ${uploading ? 'opacity-50 cursor-not-allowed' : 'hover:border-indigo-500/50 hover:bg-slate-800/30 cursor-pointer group'}`}
          >
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              {uploading ? <Loader2 size={32} className="text-indigo-400 animate-spin" /> : <FileText size={32} className="text-slate-400 group-hover:text-indigo-400" />}
            </div>
            <p className="text-slate-300 font-medium mb-1">{uploading ? 'Uploading...' : 'Click to upload or drag and drop'}</p>
            <p className="text-sm text-slate-500 mb-6">PDF, DOCX, TXT (Max 10MB)</p>
            <button disabled={uploading} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors">
              Select File
            </button>
          </div>
        </div>

        {/* Add URL Section */}
        <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <LinkIcon className="text-emerald-400" /> Add Website URL
          </h2>
          <p className="text-slate-400 text-sm mb-6">
            Provide a URL for the AI to scrape and index content. This works best for documentation or FAQ pages.
          </p>
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Website URL</label>
              <input 
                type="url" 
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/docs" 
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <button 
              onClick={handleAddUrl}
              disabled={processingUrl || !urlInput.trim()}
              className="px-4 py-3 flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-400 text-white rounded-lg text-sm font-medium transition-colors w-full mt-2"
            >
              {processingUrl ? <><Loader2 size={16} className="animate-spin" /> Processing...</> : 'Scrape & Index URL'}
            </button>
          </div>
        </div>

        {/* Test Outbound Call Section */}
        <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <span role="img" aria-label="phone" className="text-amber-400 text-2xl">📞</span> Test AI Agent
          </h2>
          <p className="text-slate-400 text-sm mb-6">
            Enter your phone number to receive a test call from your AI Agent. Ensure you've uploaded knowledge first.
          </p>
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Phone Number</label>
              <input 
                type="tel" 
                value={testPhoneNumber}
                onChange={(e) => setTestPhoneNumber(e.target.value)}
                placeholder="+1234567890" 
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
            </div>
            <button 
              onClick={handleTestCall}
              disabled={calling || !testPhoneNumber.trim()}
              className="px-4 py-3 flex justify-center items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-400 text-white rounded-lg text-sm font-medium transition-colors w-full mt-2"
            >
              {calling ? <><Loader2 size={16} className="animate-spin" /> Calling...</> : 'Call Me Now'}
            </button>
            {callMessage && (
              <p className={`text-sm mt-2 ${callMessage.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
                {callMessage}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Document List */}
      <div className="bg-[#111827] border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-[#0b1120]/50">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Database className="text-amber-400" /> Indexed Data Sources
          </h2>
          <span className="text-sm text-slate-400 bg-slate-800 px-3 py-1 rounded-full">{documents.length} Items</span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900/50 border-b border-slate-800">
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Name / URL</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Type</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date Added</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {loading ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-slate-500">
                    <Loader2 size={24} className="animate-spin mx-auto mb-2 text-indigo-400" />
                    Loading documents...
                  </td>
                </tr>
              ) : documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-slate-800/20 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {doc.file_type === 'url' ? <LinkIcon size={16} className="text-emerald-400" /> : <FileText size={16} className="text-indigo-400" />}
                      <span className="font-medium text-slate-200 truncate max-w-xs block" title={doc.filename}>{doc.filename}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-bold text-slate-500 bg-slate-800 px-2 py-1 rounded uppercase">{doc.file_type}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      <span className="text-sm text-slate-300">Active</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">{new Date(doc.created_at).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => handleDelete(doc.id)} className="text-slate-500 hover:text-red-400 transition-colors p-2 hover:bg-slate-800 rounded-lg">
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && documents.length === 0 && (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-slate-500">
                    No documents found. Upload a file or add a URL to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
