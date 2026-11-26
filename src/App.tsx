import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  LayoutDashboard, FileText, Users, Package, Settings, 
  Plus, Menu, X, CheckCircle2, History, LogOut, Loader2,
  ShoppingBag, CreditCard, FileSpreadsheet, Building2,
  Cloud, RefreshCw
} from 'lucide-react';
import { db } from './db/database';
import { Document, DocumentType, Party, UserSession, BusinessProfile } from './types';
import { getActiveSession, logoutUser } from './utils/auth';
import { initializeHsnCatalog } from './utils/hsnCatalogData';
import { isSupabaseConfigured } from './utils/supabase';
import { syncAll, pullFromCloud, pushToCloud } from './utils/cloudSync';
import { AuthPage } from './components/AuthPage';
import { Dashboard } from './components/Dashboard';
import { InvoiceBuilder } from './components/InvoiceBuilder';
import { DocumentList } from './components/DocumentList';
import { PartyManager } from './components/PartyManager';
import { ProductManager } from './components/ProductManager';
import { PurchaseManager } from './components/PurchaseManager';
import { PaymentManager } from './components/PaymentManager';
import { ReportsManager } from './components/ReportsManager';
import { BusinessSettings } from './components/BusinessSettings';
import { AuditHistory } from './components/AuditHistory';
import { InvoicePrintA4 } from './components/InvoicePrintA4';
import { BusinessRegistration } from './components/BusinessRegistration';

type ViewMode = 
  | 'dashboard' 
  | 'builder' 
  | 'documents' 
  | 'purchases' 
  | 'payments' 
  | 'reports' 
  | 'parties' 
  | 'products' 
  | 'settings' 
  | 'history' 
  | 'print';

export default function App() {
  // Session & Authentication State
  const [session, setSession] = useState<UserSession | null>(null);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // View & Document Builder State
  const [currentView, setCurrentView] = useState<ViewMode>('dashboard');
  const [builderDocType, setBuilderDocType] = useState<DocumentType>('INVOICE');
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [selectedDocForPrint, setSelectedDocForPrint] = useState<Document | null>(null);
  
  // Mobile drawer state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Toast feedback state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Cloud sync state
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    if (!session?.userId) return;
    setIsSyncing(true);
    try {
      const res = await syncAll(session.userId);
      showToast(res.message);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  // Check active session & initialize verified HSN catalog on initial load
  useEffect(() => {
    async function initApp() {
      try {
        await initializeHsnCatalog();
        const active = await getActiveSession();
        if (active) {
          setSession(active.session);
          setProfile(active.profile);
          if (isSupabaseConfigured()) {
            pullFromCloud(active.session.userId).catch(console.warn);
          }
        }
      } catch (err) {
        console.error('Initialization failed:', err);
      } finally {
        setIsInitializing(false);
      }
    }
    initApp();
  }, []);

  // Live profile query to keep business profile reactive if updated in settings
  const queriedProfile = useLiveQuery(
    async () => {
      if (!session?.userId) return undefined;
      return await db.businessProfile.where('userId').equals(session.userId).first();
    },
    [session?.userId]
  );
  const currentProfile: BusinessProfile | null = queriedProfile ?? profile;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleAuthSuccess = (sess: UserSession, prof?: BusinessProfile | null) => {
    setSession(sess);
    if (prof && (prof.companyName || prof.name)) {
      setProfile(prof);
      setCurrentView('dashboard');
      showToast(`Welcome back, ${sess.name}!`);
    } else {
      setProfile(null);
    }
  };

  const handleLogout = async () => {
    if (session) {
      await logoutUser(session.userId);
    }
    setSession(null);
    setProfile(null);
    setCurrentView('dashboard');
    setEditingDoc(null);
    setSelectedDocForPrint(null);
  };

  const handleNavigate = (view: ViewMode, docType?: DocumentType) => {
    if (docType) {
      setBuilderDocType(docType);
    }
    if (view === 'builder' && !editingDoc) {
      setEditingDoc(null);
    }
    setCurrentView(view);
    setIsMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStartNewDoc = (type: DocumentType = 'INVOICE') => {
    setEditingDoc(null);
    setBuilderDocType(type);
    setCurrentView('builder');
  };

  const handleEditDoc = (doc: Document) => {
    setEditingDoc(doc);
    setBuilderDocType(doc.docType);
    setCurrentView('builder');
  };

  const handleViewDocPrint = (doc: Document) => {
    setSelectedDocForPrint(doc);
    setCurrentView('print');
  };

  const handleDocSaved = (savedDoc: Document) => {
    showToast(`Saved ${savedDoc.docType}: ${savedDoc.docNumber}`);
    setSelectedDocForPrint(savedDoc);
    setCurrentView('print');
    if (isSupabaseConfigured() && session?.userId) {
      pushToCloud(session.userId).catch(console.warn);
    }
  };

  const handleSelectPartyForDoc = (party: Party) => {
    if (!session) return;
    const draftDoc: Partial<Document> = {
      userId: session.userId,
      partyId: party.id,
      partyName: party.name,
      partyGstin: party.gstin || '',
      partyAddress: party.billingAddress || '',
      partyPhone: party.phone || '',
      shippingAddress: party.shippingAddress || party.billingAddress || '',
      placeOfSupply: party.stateCode || (currentProfile?.stateCode || '09'),
      docType: 'INVOICE',
      items: []
    };
    setEditingDoc(draftDoc as Document);
    setBuilderDocType('INVOICE');
    setCurrentView('builder');
  };

  // Indian Financial Year calculation
  const now = new Date();
  const month = now.getMonth();
  const fullYear = now.getFullYear();
  const startYear = month >= 3 ? fullYear : fullYear - 1;
  const currentFyLabel = `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;

  // Loading state while checking IndexedDB session
  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md animate-pulse">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Loading GoGST Bill...
          </p>
        </div>
      </div>
    );
  }

  // If user is not authenticated, display login/register wizard
  if (!session) {
    return <AuthPage onAuthSuccess={handleAuthSuccess} />;
  }

  // If user is authenticated, but businessProfile is empty / not registered yet
  if (!currentProfile || (!currentProfile.companyName && !currentProfile.name)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 flex items-center justify-center text-white font-extrabold text-2xl mx-auto shadow-md mb-2">
              G
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Complete Business Registration</h1>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Setup your legal business entity, GSTIN, and tax scheme to start issuing GST-compliant invoices.
            </p>
          </div>

          <BusinessRegistration
            session={session}
            initialProfile={currentProfile}
            onSuccess={(newProfile) => {
              setProfile(newProfile);
              setCurrentView('dashboard');
              showToast(`Welcome! Business "${newProfile.companyName}" registered successfully.`);
            }}
          />
        </div>
      </div>
    );
  }

  const liveProfile: BusinessProfile = currentProfile;

  // Structured navigation with enterprise sections
  const navSections = [
    {
      title: 'Operations',
      items: [
        { id: 'dashboard' as ViewMode, label: 'Dashboard', icon: LayoutDashboard },
        { id: 'documents' as ViewMode, label: 'Invoices & Billing', icon: FileText },
        { id: 'purchases' as ViewMode, label: 'Purchases (Inward)', icon: ShoppingBag },
        { id: 'payments' as ViewMode, label: 'Payments & Receipts', icon: CreditCard }
      ]
    },
    {
      title: 'Masters & Catalog',
      items: [
        { id: 'parties' as ViewMode, label: 'Customers & Vendors', icon: Users },
        { id: 'products' as ViewMode, label: 'Products & Inventory', icon: Package },
        { id: 'reports' as ViewMode, label: 'GST Reports & Filing', icon: FileSpreadsheet }
      ]
    },
    {
      title: 'System & Audit',
      items: [
        { id: 'history' as ViewMode, label: 'Audit Trail', icon: History },
        { id: 'settings' as ViewMode, label: 'Business Settings', icon: Settings }
      ]
    }
  ];

  const userInitials = session.name
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const getViewTitle = () => {
    switch (currentView) {
      case 'dashboard': return 'Dashboard Overview';
      case 'documents': return 'Invoices & Billing';
      case 'builder': return editingDoc ? `Edit ${builderDocType}` : `New ${builderDocType}`;
      case 'purchases': return 'Inward Purchase Bills';
      case 'payments': return 'Payments & Receipts';
      case 'parties': return 'Party Master (Buyers & Suppliers)';
      case 'products': return 'Products & SKU Catalog';
      case 'reports': return 'GST Returns & Reports';
      case 'history': return 'System Audit Trail';
      case 'settings': return 'Business Settings';
      case 'print': return 'Document Preview & Print';
      default: return 'GoGST Bill';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row text-slate-900 font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl text-xs font-semibold flex items-center gap-2.5 animate-in fade-in slide-in-from-top-2 border border-slate-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Desktop Sidebar Navigation */}
      <aside className="no-print hidden md:flex flex-col w-64 bg-white border-r border-slate-200/90 shrink-0 h-screen sticky top-0 z-20 shadow-[1px_0_4px_rgba(0,0,0,0.02)]">
        {/* App Logo & Brand Header */}
        <div className="p-4 border-b border-slate-100/90">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 flex items-center justify-center text-white font-extrabold text-lg shadow-sm ring-1 ring-blue-700/20">
                G
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-sm tracking-tight text-slate-900 font-heading">
                    GoGST
                  </span>
                  <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200/80 px-1.5 py-0.2 rounded">
                    PRO
                  </span>
                </div>
                <span className="block text-[10px] font-medium text-slate-400">
                  GST Invoicing Suite
                </span>
              </div>
            </div>

            {/* Pulsing Offline Indicator */}
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200/60 text-[10px] font-semibold text-emerald-700" title="IndexedDB Engine Active - 100% Offline">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Local</span>
            </div>
          </div>

          {/* Active Business Entity Card */}
          <div className="mt-3.5 p-2.5 bg-slate-50/80 border border-slate-200/80 rounded-xl hover:border-slate-300 transition-colors">
            <div className="flex items-start gap-2">
              <Building2 className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-900 truncate font-heading" title={liveProfile.companyName || liveProfile.name}>
                  {liveProfile.companyName || liveProfile.name}
                </p>
                <div className="flex items-center justify-between text-[10px] text-slate-500 mt-0.5">
                  <span className="font-mono truncate">{liveProfile.gstin ? liveProfile.gstin : 'Unregistered'}</span>
                  <span className="font-bold text-slate-700 bg-white px-1 py-0.2 rounded border border-slate-200/60 ml-1 shrink-0">
                    {liveProfile.stateCode || '09'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Sections */}
        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {navSections.map(section => (
            <div key={section.title} className="space-y-1">
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-heading">
                {section.title}
              </p>
              {section.items.map(item => {
                const Icon = item.icon;
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavigate(item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-blue-600 text-white font-semibold shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100/70 hover:text-slate-900'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Sidebar Footer: Quick Action & User Session */}
        <div className="p-3 border-t border-slate-100 space-y-2.5 bg-white">
          <button
            onClick={() => handleStartNewDoc('INVOICE')}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold shadow-xs transition-all active:scale-[0.985]"
          >
            <Plus className="w-3.5 h-3.5 text-blue-400" />
            + Create New Invoice
          </button>

          {/* User Account Card */}
          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200/70">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
                {userInitials}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800 truncate" title={session.name}>
                  {session.name}
                </p>
                <p className="text-[10px] text-slate-400 truncate" title={session.email}>
                  {session.email}
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              title="Sign Out"
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Column with Desktop Top Bar */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Desktop Top Header Bar */}
        <header className="no-print hidden md:flex items-center justify-between h-14 px-8 bg-white/90 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-slate-900 font-heading">
              {getViewTitle()}
            </h2>
            <span className="text-slate-300">•</span>
            <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200/60 px-2 py-0.5 rounded">
              {currentFyLabel}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Cloud Sync Button */}
            <button
              type="button"
              onClick={handleSync}
              disabled={isSyncing}
              title={isSupabaseConfigured() ? 'Click to sync all data with Supabase Cloud' : 'Cloud Sync not configured (Offline Mode)'}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                isSupabaseConfigured()
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 active:scale-95'
                  : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
              }`}
            >
              <Cloud className={`w-3.5 h-3.5 ${isSupabaseConfigured() ? 'text-emerald-600' : 'text-slate-400'}`} />
              {isSyncing ? (
                <>
                  <RefreshCw className="w-3 h-3 animate-spin text-emerald-600" />
                  <span>Syncing...</span>
                </>
              ) : isSupabaseConfigured() ? (
                <span>Sync Cloud</span>
              ) : (
                <span>Offline</span>
              )}
            </button>

            {liveProfile.gstin && (
              <span className="text-xs text-slate-500 font-mono bg-slate-100/80 px-2 py-1 rounded border border-slate-200/60">
                GSTIN: <strong className="text-slate-800">{liveProfile.gstin}</strong>
              </span>
            )}
            
            <button
              onClick={() => handleStartNewDoc('INVOICE')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs transition-all active:scale-[0.985]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Tax Invoice</span>
            </button>
          </div>
        </header>

        {/* Mobile Top Navbar (Hidden on desktop) */}
        <header className="no-print md:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
              G
            </div>
            <div>
              <span className="font-bold text-sm text-slate-900 font-heading">GoGST Bill</span>
              <span className="block text-[10px] text-slate-500 truncate max-w-[150px]">
                {liveProfile.companyName || liveProfile.name}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleStartNewDoc('INVOICE')}
              className="p-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </header>

        {/* Mobile Drawer Navigation */}
        {isMobileMenuOpen && (
          <div className="no-print md:hidden fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs flex">
            <div className="w-64 bg-white h-full p-4 flex flex-col justify-between shadow-xl animate-in slide-in-from-left duration-200">
              <div className="space-y-4">
                <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                  <div>
                    <span className="font-bold text-sm text-slate-900 font-heading">GoGST Bill</span>
                    <p className="text-[11px] text-slate-500 truncate">{liveProfile.companyName || liveProfile.name}</p>
                  </div>
                  <button
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="p-1 text-slate-500 hover:text-slate-800"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <nav className="space-y-4">
                  {navSections.map(sec => (
                    <div key={sec.title} className="space-y-1">
                      <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {sec.title}
                      </p>
                      {sec.items.map(item => {
                        const Icon = item.icon;
                        const isActive = currentView === item.id;
                        return (
                          <button
                            key={item.id}
                            onClick={() => handleNavigate(item.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold ${
                              isActive ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </nav>
              </div>

              <div className="pt-3 border-t border-slate-100 space-y-2">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-semibold transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out ({session.name})
                </button>
                <div className="text-center text-[10px] text-slate-400">
                  GoGST Bill • Offline &amp; Private
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Content View Area */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full mb-16 md:mb-0">
          {currentView === 'dashboard' && (
            <Dashboard
              session={session}
              profile={liveProfile}
              onNavigate={(view, docType) => handleNavigate(view, docType)}
              onViewDocument={handleViewDocPrint}
            />
          )}

          {currentView === 'builder' && (
            <InvoiceBuilder
              session={session}
              profile={liveProfile}
              initialDocType={builderDocType}
              editingDocument={editingDoc}
              onSaved={handleDocSaved}
              onCancel={() => handleNavigate('documents')}
            />
          )}

          {currentView === 'documents' && (
            <DocumentList
              session={session}
              onNewDocument={handleStartNewDoc}
              onEditDocument={handleEditDoc}
              onViewDocument={handleViewDocPrint}
            />
          )}

          {currentView === 'purchases' && (
            <PurchaseManager
              session={session}
              profile={liveProfile}
            />
          )}

          {currentView === 'payments' && (
            <PaymentManager
              session={session}
              profile={liveProfile}
            />
          )}

          {currentView === 'parties' && (
            <PartyManager
              session={session}
              profile={liveProfile}
              onSelectPartyForDoc={handleSelectPartyForDoc}
            />
          )}

          {currentView === 'products' && (
            <ProductManager session={session} />
          )}

          {currentView === 'reports' && (
            <ReportsManager
              session={session}
              profile={liveProfile}
            />
          )}

          {currentView === 'history' && (
            <AuditHistory userId={session.userId} />
          )}

          {currentView === 'settings' && (
            <BusinessSettings
              session={session}
              onLogout={handleLogout}
            />
          )}

          {currentView === 'print' && selectedDocForPrint && liveProfile && (
            <InvoicePrintA4
              document={selectedDocForPrint}
              businessProfile={liveProfile}
              onBack={() => handleNavigate('documents')}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="no-print md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-2 py-1.5 flex justify-around items-center z-20">
        <button
          onClick={() => handleNavigate('dashboard')}
          className={`flex flex-col items-center text-[10px] font-medium py-1 px-2 ${
            currentView === 'dashboard' ? 'text-blue-600' : 'text-slate-500'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Home</span>
        </button>

        <button
          onClick={() => handleNavigate('documents')}
          className={`flex flex-col items-center text-[10px] font-medium py-1 px-2 ${
            currentView === 'documents' ? 'text-blue-600' : 'text-slate-500'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Docs</span>
        </button>

        <button
          onClick={() => handleStartNewDoc('INVOICE')}
          className="flex flex-col items-center justify-center -mt-4 w-11 h-11 bg-blue-600 text-white rounded-full shadow-md"
        >
          <Plus className="w-5 h-5" />
        </button>

        <button
          onClick={() => handleNavigate('purchases')}
          className={`flex flex-col items-center text-[10px] font-medium py-1 px-2 ${
            currentView === 'purchases' ? 'text-blue-600' : 'text-slate-500'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>Purchases</span>
        </button>

        <button
          onClick={() => handleNavigate('reports')}
          className={`flex flex-col items-center text-[10px] font-medium py-1 px-2 ${
            currentView === 'reports' ? 'text-blue-600' : 'text-slate-500'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Reports</span>
        </button>
      </nav>
    </div>
  );
}
