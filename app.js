// =========================================================================
// LOGIQUE APPLICATIVE - FORMATION IA CNFPT
// =========================================================================

// Débugger d'erreurs visuel (remote debugging)
window.addEventListener('error', function(e) {
    const errorDiv = document.createElement('div');
    errorDiv.style.position = 'fixed';
    errorDiv.style.top = '0';
    errorDiv.style.left = '0';
    errorDiv.style.width = '100%';
    errorDiv.style.background = '#ef4444';
    errorDiv.style.color = '#ffffff';
    errorDiv.style.padding = '1rem';
    errorDiv.style.zIndex = '9999';
    errorDiv.style.fontSize = '0.9rem';
    errorDiv.style.fontFamily = 'monospace';
    errorDiv.style.whiteSpace = 'pre-wrap';
    errorDiv.innerHTML = '<strong>[Erreur JS]</strong> ' + e.message + ' (ligne ' + e.lineno + ')';
    document.body.appendChild(errorDiv);
});

window.addEventListener('unhandledrejection', function(e) {
    const errorDiv = document.createElement('div');
    errorDiv.style.position = 'fixed';
    errorDiv.style.top = '0';
    errorDiv.style.left = '0';
    errorDiv.style.width = '100%';
    errorDiv.style.background = '#f59e0b';
    errorDiv.style.color = '#ffffff';
    errorDiv.style.padding = '1rem';
    errorDiv.style.zIndex = '9999';
    errorDiv.style.fontSize = '0.9rem';
    errorDiv.style.fontFamily = 'monospace';
    errorDiv.style.whiteSpace = 'pre-wrap';
    errorDiv.innerHTML = '<strong>[Erreur Promesse]</strong> ' + (e.reason ? (e.reason.message || e.reason) : 'Promesse rejetée');
    document.body.appendChild(errorDiv);
});

// Fonction pour rapporter les erreurs capturées
function reportError(source, err) {
    console.error(source + " error:", err);
    
    const showBanner = () => {
        const errorDiv = document.createElement('div');
        errorDiv.style.position = 'fixed';
        errorDiv.style.top = '0';
        errorDiv.style.left = '0';
        errorDiv.style.width = '100%';
        errorDiv.style.background = '#ef4444';
        errorDiv.style.color = '#ffffff';
        errorDiv.style.padding = '1rem';
        errorDiv.style.zIndex = '99999';
        errorDiv.style.fontSize = '0.9rem';
        errorDiv.style.fontFamily = 'monospace';
        errorDiv.style.whiteSpace = 'pre-wrap';
        errorDiv.innerHTML = '<strong>[Erreur Capturée: ' + source + ']</strong> ' + (err.message || err) + (err.stack ? '<br><small style="font-size:0.75rem">' + err.stack.split('\n')[0] + '</small>' : '');
        document.body.appendChild(errorDiv);
    };

    if (document.body) {
        showBanner();
    } else {
        window.addEventListener('DOMContentLoaded', showBanner);
    }
}

// Polyfill pour NodeList.prototype.forEach (compatibilité anciens navigateurs)
if (window.NodeList && !NodeList.prototype.forEach) {
    NodeList.prototype.forEach = Array.prototype.forEach;
}

// Configuration Supabase
const supabaseUrl = 'https://hkqawuxumimkainegqln.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcWF3dXh1bWlta2FpbmVncWxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMzAxNzcsImV4cCI6MjA5NzcwNjE3N30.0CaEReFJcbPXk_3sI8nRdy8iU9Sl0n4S3VDbiw3Q7p8';
let supabaseClient = null;

// Variables d'état global
let currentStep = 1;
const totalSteps = 4;
let selectedProfile = '';
let selectedContexts = [];
let wordCloudsData = {
    usages: [],
    attentes: [],
    outils: []
};
let surveyResponsesList = [];
let refreshInterval = null;
let chartProfiles = null;
let chartContexts = null;
let chartInterests = null;
let realtimeChannel = null;

// =========================================================================
// WRAPPERS DE SÉCURITÉ & ROBUSTESSE
// =========================================================================

// Récupération sécurisée du localStorage (évite les erreurs SecurityError en navigation privée)
function safeGetItem(key) {
    try {
        return localStorage.getItem(key);
    } catch (e) {
        console.warn("localStorage.getItem bloqué :", e);
        return null;
    }
}

// Enregistrement sécurisé dans le localStorage
function safeSetItem(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        console.warn("localStorage.setItem bloqué :", e);
    }
}

// Suppression sécurisée du localStorage
function safeRemoveItem(key) {
    try {
        localStorage.removeItem(key);
    } catch (e) {
        console.warn("localStorage.removeItem bloqué :", e);
    }
}

// Liaison d'écouteur d'événement tolérante aux pannes
function safeAddListener(id, event, callback) {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener(event, callback);
    } else {
        console.warn(`Élément avec l'ID '${id}' introuvable. Écouteur ignoré.`);
    }
}

// Initialisation globale robuste de l'application
function initApp() {
    try {
        // Initialisation du client Supabase
        supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
        initRealtime();
        seedDefaultWords();
    } catch (e) {
        showToast("Erreur d'initialisation de Supabase. Vérifiez votre connexion.", "error");
        reportError("Supabase init", e);
    }

    try {
        // Gestion du routage SPA
        window.addEventListener('hashchange', handleRouting);
        handleRouting();
    } catch (e) {
        reportError("Initial routing", e);
    }

    try {
        // Configuration des écouteurs d'événements UI
        setupEventListeners();
    } catch (e) {
        reportError("setupEventListeners", e);
    }
    
    try {
        // Vérification de session admin existante
        checkAdminSession();
    } catch (e) {
        reportError("checkAdminSession", e);
    }
    window.appInitialized = true;
}

// Vérification de l'état de chargement du document pour parer aux chargements asynchrones/différés
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// =========================================================================
// INITIALISATION TEMPS RÉEL (REALTIME WEB-SOCKETS)
// =========================================================================

function initRealtime() {
    if (!supabaseClient) return;
    
    // Déconnexion si déjà existant
    if (realtimeChannel) {
        supabaseClient.removeChannel(realtimeChannel);
    }

    realtimeChannel = supabaseClient
        .channel('realtime-db-changes')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'word_cloud_inputs' },
            (payload) => {
                // Si l'utilisateur est sur l'étape nuage actif
                if (currentStep === 2) {
                    loadWordCloud('usages', true);
                } else if (currentStep === 3) {
                    loadWordCloud('attentes', true);
                } else if (currentStep === 4) {
                    loadWordCloud('outils', true);
                }
                
                // Si le sondage est complété, recharger les nuages récapitulatifs
                if (safeGetItem('survey_completed') === 'true' && window.location.hash === '#sondage') {
                    loadWordCloud('usages', true).then(() => renderReadOnlyCloud('usages'));
                    loadWordCloud('attentes', true).then(() => renderReadOnlyCloud('attentes'));
                    loadWordCloud('outils', true).then(() => renderReadOnlyCloud('outils'));
                }

                // Si l'admin regarde son dashboard
                if (window.location.hash === '#admin') {
                    loadAdminDashboard();
                }
            }
        )
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'survey_responses' },
            (payload) => {
                if (window.location.hash === '#admin') {
                    loadAdminDashboard();
                }
            }
        )
        .subscribe();
}

// =========================================================================
// ROUTAGE SPA
// =========================================================================

async function handleRouting() {
    try {
        const hash = window.location.hash || '#programme';
        const views = document.querySelectorAll('.app-view');
        const navButtons = document.querySelectorAll('.btn-nav');
        
        // Nettoyer l'intervalle de rafraîchissement précédent
        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }

        // Cacher toutes les vues
        views.forEach(v => v.classList.remove('active-view'));
        navButtons.forEach(b => b.classList.remove('active'));

        // Activer la vue correspondante
        const targetViewId = 'view-' + hash.substring(1);
        const targetView = document.getElementById(targetViewId);
        if (targetView) {
            targetView.classList.add('active-view');
        } else {
            console.warn(`View element with ID '${targetViewId}' not found.`);
        }

        const navBtn = document.querySelector(`[href="${hash}"]`);
        if (navBtn) {
            navBtn.classList.add('active');
        }

        if (hash === '#sondage') {
            // Si le sondage est déjà complété, on redirige vers l'écran de remerciement/résultat
            if (safeGetItem('survey_completed') === 'true') {
                showSurveySuccessView();
            } else {
                resetSurveyWizard();
            }
        } 
        else if (hash === '#admin') {
            const session = await getSession();
            if (session) {
                loadAdminDashboard();
            } else {
                // Si pas connecté, rediriger vers le programme et ouvrir la modale de login
                window.location.hash = '#programme';
                openLoginModal();
            }
        }
    } catch (e) {
        reportError("Routing", e);
    }
}

// =========================================================================
// ÉCOUTEURS D'ÉVÉNEMENTS GÉNÉRAUX
// =========================================================================

function setupEventListeners() {
    // Boutons de navigation du sondage
    safeAddListener('btn-prev', 'click', prevStep);
    safeAddListener('btn-next', 'click', nextStep);

    // Écouteurs pour l'étape 1 : Profils
    document.querySelectorAll('.profile-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.profile-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedProfile = card.dataset.profile;
            const btnNext = document.getElementById('btn-next');
            if (btnNext) btnNext.disabled = false;
        });
    });

    // Écouteurs pour le nuage usages (Ajout par input)
    safeAddListener('btn-add-usage', 'click', () => {
        submitNewWord('usages', 'input-usage');
    });
    const inputUsage = document.getElementById('input-usage');
    if (inputUsage) {
        inputUsage.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') submitNewWord('usages', 'input-usage');
        });
    }

    // Écouteurs pour les nuages de mots (Ajout par input)
    safeAddListener('btn-add-attente', 'click', () => {
        submitNewWord('attentes', 'input-attente');
    });
    const inputAttente = document.getElementById('input-attente');
    if (inputAttente) {
        inputAttente.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') submitNewWord('attentes', 'input-attente');
        });
    }

    safeAddListener('btn-add-outil', 'click', () => {
        submitNewWord('outils', 'input-outil');
    });
    const inputOutil = document.getElementById('input-outil');
    if (inputOutil) {
        inputOutil.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') submitNewWord('outils', 'input-outil');
        });
    }

    // Bouton cadenas discret
    safeAddListener('btn-open-login', 'click', openLoginModal);

    // Modale de connexion Admin
    safeAddListener('btn-cancel-login', 'click', closeLoginModal);
    safeAddListener('btn-submit-login', 'click', submitLogin);
    const inputPassword = document.getElementById('input-admin-password');
    if (inputPassword) {
        inputPassword.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') submitLogin();
        });
    }

    // Actions d'administration
    safeAddListener('btn-logout', 'click', handleLogout);
    safeAddListener('btn-export-csv', 'click', exportDataToCSV);
    safeAddListener('btn-reset-db', 'click', confirmResetDatabase);

    // Bouton de réinitialisation/recommencer le sondage
    safeAddListener('btn-restart-survey', 'click', restartSurvey);
}

// =========================================================================
// LOGIQUE DU SONDAGE PAR ÉTAPES (WIZARD)
// =========================================================================

function resetSurveyWizard() {
    currentStep = 1;
    selectedProfile = '';
    selectedContexts = [];
    
    // Reset DOM
    document.querySelectorAll('.profile-card').forEach(c => c.classList.remove('selected'));
    const inputUsage = document.getElementById('input-usage');
    if (inputUsage) inputUsage.value = '';
    const inputAttente = document.getElementById('input-attente');
    if (inputAttente) inputAttente.value = '';
    const inputOutil = document.getElementById('input-outil');
    if (inputOutil) inputOutil.value = '';

    // Afficher premier écran de formulaire
    document.getElementById('survey-form-container').style.display = 'block';
    document.getElementById('survey-success-container').style.display = 'none';

    updateStepView();
}

function updateStepView() {
    // Masquer toutes les étapes
    document.querySelectorAll('.survey-step').forEach(step => {
        step.classList.remove('active-step');
    });

    // Activer l'étape en cours
    document.getElementById(`step-${currentStep}`).classList.add('active-step');

    // Mettre à jour la barre de progression
    const progressPercent = (currentStep / totalSteps) * 100;
    document.getElementById('progress-bar').style.width = `${progressPercent}%`;
    document.getElementById('step-indicator-text').textContent = `Étape ${currentStep} sur ${totalSteps}`;

    // Configurer l'état des boutons Précédent/Suivant
    document.getElementById('btn-prev').disabled = currentStep === 1;
    
    if (currentStep === totalSteps) {
        document.getElementById('btn-next').innerHTML = 'Terminer <span style="font-size:1.1rem">✓</span>';
        document.getElementById('btn-next').disabled = false;
    } else {
        document.getElementById('btn-next').innerHTML = 'Suivant <span style="font-size:1.1rem">→</span>';
        // Validation dynamique selon l'étape
        if (currentStep === 1) {
            document.getElementById('btn-next').disabled = !selectedProfile;
        } else {
            document.getElementById('btn-next').disabled = false;
        }
    }

    // Charger le nuage de mots de l'étape active
    if (currentStep === 2) {
        loadWordCloud('usages');
    } else if (currentStep === 3) {
        loadWordCloud('attentes');
    } else if (currentStep === 4) {
        loadWordCloud('outils');
    }
}

function nextStep() {
    if (currentStep < totalSteps) {
        currentStep++;
        updateStepView();
    } else {
        // Soumission finale du sondage
        submitSurvey();
    }
}

function prevStep() {
    if (currentStep > 1) {
        currentStep--;
        updateStepView();
    }
}

// =========================================================================
// GESTION DES NUAGES DE MOTS (WORD CLOUD)
// =========================================================================

// Charger les mots depuis la DB
async function loadWordCloud(questionId, isSilent = false) {
    if (!supabaseClient) return;
    
    try {
        const { data, error } = await supabaseClient
            .from('word_cloud_inputs')
            .select('*')
            .eq('question_id', questionId)
            .order('votes', { ascending: false });

        if (error) throw error;

        wordCloudsData[questionId] = data || [];
        renderWordCloud(questionId);
    } catch (e) {
        console.error("Error loading word cloud:", e);
        if (!isSilent) showToast("Erreur lors du chargement du nuage de mots.", "error");
    }
}

function renderWordCloud(questionId) {
    const container = document.getElementById(`cloud-${questionId}`);
    if (!container) return;

    container.innerHTML = '';
    const words = wordCloudsData[questionId];

    if (!words || words.length === 0) {
        container.innerHTML = '<div class="word-cloud-empty">Aucun mot pour l\'instant. Soyez le premier à vous exprimer !</div>';
        return;
    }

    // Trouver le nombre max de votes pour calculer l'échelle relative
    const maxVotes = Math.max(...words.map(w => w.votes));

    words.forEach(item => {
        const bubble = document.createElement('div');
        bubble.className = 'word-bubble';
        
        let isSelected = false;
        const storageKey = `voted_${questionId}_${item.word.toLowerCase()}`;
        
        if (Number(item.votes) <= 0) {
            // Nettoyage automatique des clés de vote obsolètes suite à un RESET
            safeRemoveItem(storageKey);
            if (questionId === 'usages') {
                const idx = selectedContexts.indexOf(item.word);
                if (idx > -1) {
                    selectedContexts.splice(idx, 1);
                }
            }
        } else {
            if (questionId === 'usages') {
                isSelected = selectedContexts.includes(item.word);
                if (isSelected) {
                    bubble.classList.add('selected-interactive');
                }
            } else {
                isSelected = safeGetItem(storageKey) === 'true';
                if (isSelected) {
                    bubble.classList.add('voted');
                }
            }
        }

        // Calculer une taille proportionnelle (min: 0.85rem, max: 1.15rem)
        let minFontSize = 0.85;
        let maxFontSize = 1.15;
        let fontSize = minFontSize;
        if (maxVotes > 0) {
            fontSize = minFontSize + (item.votes / maxVotes) * (maxFontSize - minFontSize);
        }
        bubble.style.fontSize = `${fontSize}rem`;

        // Calculer le poids relatif (0 à 1) pour les couleurs
        const weight = maxVotes > 0 ? (item.votes / maxVotes) : 0;

        // Appliquer des couleurs en fonction de la taille/votes
        if (Number(item.votes) <= 0) {
            bubble.style.borderColor = 'var(--border-glass-light)';
            bubble.style.color = 'var(--text-muted-dark)';
            bubble.style.background = 'rgba(255, 255, 255, 0.4)';
        } else if (weight <= 0.33) {
            bubble.style.borderColor = 'rgba(99, 102, 241, 0.3)';
            bubble.style.color = 'var(--color-primary-light)';
            bubble.style.background = 'rgba(99, 102, 241, 0.02)';
        } else if (weight <= 0.66) {
            bubble.style.borderColor = 'var(--color-accent)';
            bubble.style.color = 'var(--color-accent)';
            bubble.style.background = 'rgba(6, 182, 212, 0.04)';
        } else {
            bubble.style.borderColor = 'var(--color-purple)';
            bubble.style.color = 'var(--color-purple)';
            bubble.style.background = 'rgba(147, 51, 234, 0.04)';
            bubble.style.boxShadow = '0 4px 10px rgba(147, 51, 234, 0.08)';
        }

        // Structure HTML avec coche ✓ si sélectionné/voté
        if (isSelected) {
            bubble.innerHTML = `<span class="word-text">✓ ${escapeHTML(item.word)}</span>`;
        } else {
            bubble.innerHTML = `<span class="word-text">${escapeHTML(item.word)}</span>`;
        }

        // Événement clic
        bubble.addEventListener('click', () => handleWordClick(questionId, item));

        container.appendChild(bubble);
    });
}

// Gère le clic sur un mot du nuage (Vote et Dévote)
async function handleWordClick(questionId, item) {
    const wordLower = item.word.toLowerCase();
    const storageKey = `voted_${questionId}_${wordLower}`;
    
    if (questionId === 'usages') {
        const index = selectedContexts.indexOf(item.word);
        if (index > -1) {
            // Déselectionner
            selectedContexts.splice(index, 1);
            
            // Dévoter si voté sur cet appareil
            if (safeGetItem(storageKey) === 'true') {
                safeRemoveItem(storageKey);
                try {
                    await supabaseClient
                        .from('word_cloud_inputs')
                        .update({ votes: Math.max(0, item.votes - 1) })
                        .eq('question_id', 'usages')
                        .eq('word', item.word);
                } catch (e) {
                    console.error("Error devoting usage:", e);
                }
            }
            await loadWordCloud('usages');
        } else {
            // Sélectionner
            selectedContexts.push(item.word);
            
            // Voter si pas déjà voté sur cet appareil
            if (safeGetItem(storageKey) !== 'true') {
                safeSetItem(storageKey, 'true');
                try {
                    await supabaseClient
                        .from('word_cloud_inputs')
                        .update({ votes: item.votes + 1 })
                        .eq('question_id', 'usages')
                        .eq('word', item.word);
                } catch (e) {
                    console.error("Error voting for usage:", e);
                }
            }
            await loadWordCloud('usages');
        }
    } else {
        // Pour les autres nuages (attentes, outils)
        if (safeGetItem(storageKey) === 'true') {
            // Déjà voté, on dévote
            safeRemoveItem(storageKey);
            try {
                await supabaseClient
                    .from('word_cloud_inputs')
                    .update({ votes: Math.max(0, item.votes - 1) })
                    .eq('question_id', questionId)
                    .eq('word', item.word);
                showToast("Vote retiré.", "info");
            } catch (e) {
                console.error("Error devoting:", e);
            }
            await loadWordCloud(questionId);
        } else {
            // Pas encore voté, on vote
            safeSetItem(storageKey, 'true');
            try {
                await supabaseClient
                    .from('word_cloud_inputs')
                    .update({ votes: item.votes + 1 })
                    .eq('question_id', questionId)
                    .eq('word', item.word);
                showToast("Vote enregistré !", "success");
            } catch (e) {
                console.error("Error voting:", e);
            }
            await loadWordCloud(questionId);
        }
    }
}

// Soumission d'un nouveau mot
async function submitNewWord(questionId, inputId) {
    const input = document.getElementById(inputId);
    const rawInput = input.value;
    
    if (!rawInput.trim()) {
        showToast("Mot vide ou de liaison ignoré.", "info");
        input.value = '';
        return;
    }
    
    // Limitation à 8 mots
    const wordsArray = rawInput.trim().split(/\s+/);
    if (wordsArray.length > 8) {
        showToast("Le texte ne doit pas dépasser 8 mots.", "warning");
        return;
    }

    const word = sanitizeAndCleanWord(rawInput);
    
    if (!word) {
        showToast("Mot vide ou de liaison ignoré.", "info");
        input.value = '';
        return;
    }

    if (word.length > 80) {
        showToast("Le mot ou l'expression est trop long (max 80 car.)", "info");
        return;
    }

    const wordLower = word.toLowerCase();
    
    // Vérifier si le mot existe déjà localement dans le nuage
    const existing = wordCloudsData[questionId].find(w => w.word.toLowerCase() === wordLower);
    
    if (existing) {
        // Si existe déjà, on vote si pas déjà voté
        const storageKey = `voted_${questionId}_${existing.word.toLowerCase()}`;
        if (safeGetItem(storageKey) === 'true') {
            showToast(`Vous avez déjà voté pour "${existing.word}"`, "info");
        } else {
            await handleWordClick(questionId, existing);
        }
        if (questionId === 'usages' && !selectedContexts.includes(existing.word)) {
            selectedContexts.push(existing.word);
            renderWordCloud('usages');
        }
        input.value = '';
        return;
    }

    try {
        // Insérer dans la base de données (démarre à 1 vote pour l'utilisateur qui le soumet)
        const { error } = await supabaseClient
            .from('word_cloud_inputs')
            .insert([{ question_id: questionId, word: word, votes: 1 }]);

        if (error) throw error;

        // Marquer comme voté localement
        safeSetItem(`voted_${questionId}_${wordLower}`, 'true');
        if (questionId === 'usages' && !selectedContexts.includes(word)) {
            selectedContexts.push(word);
        }
        
        input.value = '';
        showToast(`"${word}" a été ajouté !`, "success");
        
        // Recharger le nuage
        await loadWordCloud(questionId);
    } catch (e) {
        console.error("Error inserting word:", e);
        showToast("Erreur lors de l'ajout du mot.", "error");
    }
}

// =========================================================================
// SOUMISSION FINALE DU SONDAGE
// =========================================================================

async function submitSurvey() {
    // Loader sur le bouton
    const btn = document.getElementById('btn-next');
    if (!btn) return;
    
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Envoi... <span class="spinner">⏳</span>';

    // Collecter les attentes et outils pour lesquels l'utilisateur a voté
    const findOriginalWord = (questionId, lowerWord) => {
        const list = wordCloudsData[questionId] || [];
        const found = list.find(w => w.word.toLowerCase() === lowerWord);
        return found ? found.word : lowerWord.charAt(0).toUpperCase() + lowerWord.slice(1);
    };

    const votedAttentes = [];
    const votedOutils = [];
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && localStorage.getItem(key) === 'true') {
                if (key.startsWith('voted_attentes_')) {
                    const lowerWord = key.replace('voted_attentes_', '');
                    votedAttentes.push(findOriginalWord('attentes', lowerWord));
                } else if (key.startsWith('voted_outils_')) {
                    const lowerWord = key.replace('voted_outils_', '');
                    votedOutils.push(findOriginalWord('outils', lowerWord));
                }
            }
        }
    } catch (e) {
        console.warn("Error collecting voted items for submit:", e);
    }

    const responseId = generateUUID();
    const surveyData = {
        id: responseId,
        profile: selectedProfile,
        usage_contexts: selectedContexts,
        interests: {
            attentes: votedAttentes,
            outils: votedOutils
        }
    };

    if (!supabaseClient) {
        console.warn("Supabase non disponible. Mode démo actif.");
        safeSetItem('survey_completed', 'true');
        showSurveySuccessView();
        showToast("Mode démo : Réponses enregistrées localement.", "info");
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('survey_responses')
            .insert([surveyData]);

        if (error) throw error;

        // Enregistrer la complétion du sondage dans le localStorage
        safeSetItem('survey_completed', 'true');
        safeSetItem('survey_response_id', responseId);
        
        // Nettoyer les intervalles
        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }

        // Afficher l'écran de succès
        showSurveySuccessView();
    } catch (e) {
        console.error("Error submitting survey:", e);
        showToast("Erreur lors de l'envoi de vos réponses. Veuillez réessayer.", "error");
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// Afficher la vue finale avec les résultats des nuages consolidés
async function showSurveySuccessView() {
    document.getElementById('survey-form-container').style.display = 'none';
    document.getElementById('survey-success-container').style.display = 'block';

    // Charger et afficher les trois nuages en mode lecture seule
    await loadWordCloud('usages');
    await loadWordCloud('attentes');
    await loadWordCloud('outils');
    
    renderReadOnlyCloud('usages');
    renderReadOnlyCloud('attentes');
    renderReadOnlyCloud('outils');
}

function renderReadOnlyCloud(questionId) {
    const container = document.getElementById(`result-cloud-${questionId}`);
    if (!container) return;

    container.innerHTML = '';
    const words = wordCloudsData[questionId];

    if (!words || words.length === 0) {
        container.innerHTML = '<div class="word-cloud-empty">Aucun mot.</div>';
        return;
    }

    const maxVotes = Math.max(...words.map(w => w.votes));

    words.forEach(item => {
        const bubble = document.createElement('div');
        bubble.className = 'word-bubble read-only';
        
        const storageKey = `voted_${questionId}_${item.word.toLowerCase()}`;
        let hasVoted = false;
        
        if (Number(item.votes) <= 0) {
            // Nettoyage automatique des clés de vote obsolètes suite à un RESET
            safeRemoveItem(storageKey);
        } else {
            hasVoted = safeGetItem(storageKey) === 'true';
            if (hasVoted) {
                bubble.classList.add('voted-highlight');
            }
        }

        // Calculer une taille proportionnelle (min: 0.85rem, max: 1.15rem)
        let minFontSize = 0.85;
        let maxFontSize = 1.15;
        let fontSize = minFontSize;
        if (maxVotes > 0) {
            fontSize = minFontSize + (item.votes / maxVotes) * (maxFontSize - minFontSize);
        }
        bubble.style.fontSize = `${fontSize}rem`;

        const weight = maxVotes > 0 ? (item.votes / maxVotes) : 0;

        // Ne pas surcharger le style si déjà surligné en voted-highlight
        if (!hasVoted) {
            if (Number(item.votes) <= 0) {
                bubble.style.borderColor = 'var(--border-glass-light)';
                bubble.style.color = 'var(--text-muted-dark)';
                bubble.style.background = 'rgba(255, 255, 255, 0.4)';
            } else if (weight <= 0.33) {
                bubble.style.borderColor = 'rgba(99, 102, 241, 0.3)';
                bubble.style.color = 'var(--color-primary-light)';
                bubble.style.background = 'rgba(99, 102, 241, 0.02)';
            } else if (weight <= 0.66) {
                bubble.style.borderColor = 'var(--color-accent)';
                bubble.style.color = 'var(--color-accent)';
                bubble.style.background = 'rgba(6, 182, 212, 0.04)';
            } else {
                bubble.style.borderColor = 'var(--color-purple)';
                bubble.style.color = 'var(--color-purple)';
                bubble.style.background = 'rgba(147, 51, 234, 0.04)';
                bubble.style.boxShadow = '0 4px 10px rgba(147, 51, 234, 0.08)';
            }
        }

        // Structure HTML avec coche ✓ si sélectionné/voté
        if (hasVoted) {
            bubble.innerHTML = `<span class="word-text">✓ ${escapeHTML(item.word)}</span>`;
        } else {
            bubble.innerHTML = `<span class="word-text">${escapeHTML(item.word)}</span>`;
        }

        container.appendChild(bubble);
    });
}

// Recommencer le sondage : nettoie les votes locaux, décrémente en DB et supprime la réponse
async function restartSurvey() {
    const btn = document.getElementById('btn-restart-survey');
    const originalText = btn ? btn.innerHTML : "🔄 Recommencer le sondage";
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = "Réinitialisation... ⏳";
    }

    if (supabaseClient) {
        try {
            // 2. Supprimer la réponse précédente
            const lastResponseId = safeGetItem('survey_response_id');
            if (lastResponseId) {
                await supabaseClient
                    .from('survey_responses')
                    .delete()
                    .eq('id', lastResponseId);
            }

            // 3. Rollback des votes dans word_cloud_inputs
            const questionIds = ['usages', 'attentes', 'outils'];
            for (const qid of questionIds) {
                const { data: words, error } = await supabaseClient
                    .from('word_cloud_inputs')
                    .eq('question_id', qid);
                
                if (!error && words) {
                    for (const item of words) {
                        const storageKey = `voted_${qid}_${item.word.toLowerCase()}`;
                        if (safeGetItem(storageKey) === 'true') {
                            await supabaseClient
                                .from('word_cloud_inputs')
                                .update({ votes: Math.max(0, item.votes - 1) })
                                .eq('id', item.id);
                        }
                    }
                }
            }
        } catch (e) {
            console.error("Erreur lors de l'annulation des votes en BDD :", e);
        }
    }

    // 4. Nettoyer le localStorage
    safeRemoveItem('survey_completed');
    safeRemoveItem('survey_response_id');
    try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('voted_')) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => safeRemoveItem(key));
    } catch (e) {
        console.warn("Erreur de nettoyage localStorage :", e);
    }

    // 5. Réinitialiser l'interface et rediriger
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
    showToast("Le sondage a été réinitialisé.", "success");
    
    // Retourner au début du sondage
    window.location.hash = '#programme';
    setTimeout(() => {
        window.location.hash = '#sondage';
    }, 100);
}

// Permettre à l'utilisateur de refaire le sondage (Utile pour le formateur ou tests)
function debugResetSurvey() {
    safeRemoveItem('survey_completed');
    // Nettoyer aussi les votes pour pouvoir retester
    try {
        for (let key in localStorage) {
            if (key.startsWith('voted_')) {
                safeRemoveItem(key);
            }
        }
    } catch (e) {
        console.warn("Erreur lors de la réinitialisation de localStorage :", e);
    }
    window.location.hash = '#programme';
    setTimeout(() => {
        window.location.hash = '#sondage';
    }, 100);
}

// =========================================================================
// ESPACE ADMINISTRATION (CONNEXION & ACCÈS)
// =========================================================================

function openLoginModal() {
    document.getElementById('modal-login').classList.add('active-modal');
    document.getElementById('input-admin-password').value = '';
    document.getElementById('input-admin-password').focus();
}

function closeLoginModal() {
    document.getElementById('modal-login').classList.remove('active-modal');
    // Si on a annulé le login en essayant d'accéder directement à l'admin, on repart sur le programme
    if (window.location.hash === '#admin') {
        window.location.hash = '#programme';
    }
}

async function checkAdminSession() {
    const session = await getSession();
    if (session) {
        document.getElementById('btn-open-login').style.color = 'var(--color-accent)';
    } else {
        document.getElementById('btn-open-login').style.color = 'rgba(15, 23, 42, 0.2)';
    }
}

async function getSession() {
    if (!supabaseClient) return null;
    try {
        const { data, error } = await supabaseClient.auth.getSession();
        if (error) return null;
        return data ? data.session : null;
    } catch (e) {
        return null;
    }
}

async function submitLogin() {
    const password = document.getElementById('input-admin-password').value;
    if (!password) {
        showToast("Veuillez saisir un mot de passe.", "info");
        return;
    }

    const btnSubmit = document.getElementById('btn-submit-login');
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Connexion...';

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: 'admin@admin.fr',
            password: password
        });

        if (error) throw error;

        showToast("Connexion d'administration réussie !", "success");
        closeLoginModal();
        checkAdminSession();
        
        // Rediriger vers la vue d'administration
        window.location.hash = '#admin';
    } catch (e) {
        console.error("Login error:", e);
        showToast("Mot de passe incorrect ou erreur d'authentification.", "error");
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Valider';
    }
}

async function handleLogout() {
    if (!supabaseClient) return;
    try {
        await supabaseClient.auth.signOut();
        showToast("Déconnexion réussie.", "info");
        checkAdminSession();
        window.location.hash = '#programme';
    } catch (e) {
        console.error("Logout error:", e);
    }
}

// =========================================================================
// TABLEAU DE BORD D'ADMINISTRATION (STATS & EXPORTS)
// =========================================================================

async function loadAdminDashboard() {
    if (!supabaseClient) return;

    try {
        // 1. Charger toutes les réponses au sondage
        const { data: responses, error: rError } = await supabaseClient
            .from('survey_responses')
            .select('*')
            .order('created_at', { ascending: false });

        if (rError) throw rError;
        surveyResponsesList = responses || [];

        // 2. Charger les nuages de mots
        await loadWordCloud('usages');
        await loadWordCloud('attentes');
        await loadWordCloud('outils');

        // Mettre à jour l'interface
        renderStats();
        renderAdminClouds();
        renderRawDataTable();

    } catch (e) {
        console.error("Error loading dashboard:", e);
        showToast("Erreur lors du chargement des données analytiques.", "error");
        // Si l'accès est refusé (ex: session expirée), déconnecter
        if (e.status === 401 || e.status === 403) {
            handleLogout();
        }
    }
}

function renderStats() {
    const total = surveyResponsesList.length;
    document.getElementById('stat-total-respondents').textContent = total;

    // Détruire les instances existantes pour éviter le bug de superposition Chart.js
    if (chartProfiles) { chartProfiles.destroy(); chartProfiles = null; }
    if (chartContexts) { chartContexts.destroy(); chartContexts = null; }
    if (chartInterests) { chartInterests.destroy(); chartInterests = null; }

    if (total === 0) return;

    // --- CHART 1 : PROFILS (DONUT) ---
    const profileCounts = {};
    surveyResponsesList.forEach(r => {
        profileCounts[r.profile] = (profileCounts[r.profile] || 0) + 1;
    });
    const profileLabels = Object.keys(profileCounts);
    const profileData = Object.values(profileCounts);

    const ctxProfiles = document.getElementById('chart-profiles').getContext('2d');
    chartProfiles = new Chart(ctxProfiles, {
        type: 'doughnut',
        data: {
            labels: profileLabels,
            datasets: [{
                data: profileData,
                backgroundColor: [
                    '#4f46e5', // Indigo
                    '#06b6d4', // Cyan
                    '#9333ea', // Purple
                    '#10b981', // Emerald
                    '#f59e0b'  // Amber
                ],
                borderWidth: 1,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: '#475569',
                        font: { family: 'Inter', size: 10 }
                    }
                }
            }
        }
    });

    // --- CHART 2 : CONTEXTES (BAR HORIZONTAL) ---
    const contextCounts = {};
    surveyResponsesList.forEach(r => {
        if (r.usage_contexts && Array.isArray(r.usage_contexts)) {
            r.usage_contexts.forEach(ctx => {
                contextCounts[ctx] = (contextCounts[ctx] || 0) + 1;
            });
        }
    });
    const sortedContexts = Object.entries(contextCounts).sort((a, b) => b[1] - a[1]);
    const contextLabels = sortedContexts.map(e => e[0]);
    const contextData = sortedContexts.map(e => e[1]);

    const ctxContexts = document.getElementById('chart-contexts').getContext('2d');
    chartContexts = new Chart(ctxContexts, {
        type: 'bar',
        data: {
            labels: contextLabels,
            datasets: [{
                label: 'Votes',
                data: contextData,
                backgroundColor: '#06b6d4',
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(15, 23, 42, 0.05)' },
                    ticks: { color: '#475569', stepSize: 1 }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: '#475569', font: { size: 10 } }
                }
            }
        }
    });

}

// Rendu des nuages de mots avec outils de modération (Suppression)
function renderAdminClouds() {
    renderAdminCloudContainer('usages', 'admin-cloud-usages');
    renderAdminCloudContainer('attentes', 'admin-cloud-attentes');
    renderAdminCloudContainer('outils', 'admin-cloud-outils');
}

function renderAdminCloudContainer(questionId, elementId) {
    const container = document.getElementById(elementId);
    if (!container) return;

    container.innerHTML = '';
    const words = wordCloudsData[questionId];

    if (!words || words.length === 0) {
        container.innerHTML = '<div class="word-cloud-empty">Aucun mot soumis.</div>';
        return;
    }

    words.forEach(item => {
        const chip = document.createElement('div');
        chip.className = 'word-bubble-admin';
        chip.innerHTML = `
            <span>${escapeHTML(item.word)} (${item.votes})</span>
            <button class="btn-delete-word" title="Supprimer ce mot" data-id="${item.id}" data-word="${escapeHTML(item.word)}" data-qid="${questionId}">×</button>
        `;
        
        chip.querySelector('.btn-delete-word').addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            const word = e.target.dataset.word;
            const qid = e.target.dataset.qid;
            deleteCloudWord(id, word, qid);
        });

        container.appendChild(chip);
    });
}

// Supprimer un mot du nuage (Modération)
async function deleteCloudWord(id, word, questionId) {
    if (!confirm(`Voulez-vous vraiment supprimer définitivement le mot "${word}" ?`)) return;

    try {
        const { error } = await supabaseClient
            .from('word_cloud_inputs')
            .delete()
            .eq('id', id);

        if (error) throw error;

        showToast(`Mot "${word}" supprimé.`, "success");
        // Recharger
        await loadWordCloud(questionId);
        renderAdminClouds();
    } catch (e) {
        console.error("Delete word error:", e);
        showToast("Erreur lors de la suppression.", "error");
    }
}

// Rendu de la table brute des réponses
function renderRawDataTable() {
    const tbody = document.getElementById('admin-table-body');
    tbody.innerHTML = '';

    if (surveyResponsesList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 2rem; color: var(--text-muted-light);">Aucune réponse enregistrée pour le moment.</td></tr>';
        return;
    }

    surveyResponsesList.forEach(r => {
        const tr = document.createElement('tr');
        
        // Formater la date
        const dateStr = new Date(r.created_at).toLocaleString('fr-FR', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
        });

        // Formater les contextes
        const contextsStr = r.usage_contexts ? r.usage_contexts.join(', ') : '';

        tr.innerHTML = `
            <td style="font-weight: 600; color:var(--text-light)">${dateStr}</td>
            <td style="color: var(--color-accent); font-weight: 500;">${escapeHTML(r.profile)}</td>
            <td>${escapeHTML(contextsStr)}</td>
            <td style="text-align: center;">
                <button class="btn-delete-word" style="font-size:1.2rem;" title="Supprimer cette réponse" data-id="${r.id}">×</button>
            </td>
        `;

        tr.querySelector('.btn-delete-word').addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            deleteSurveyResponse(id);
        });

        tbody.appendChild(tr);
    });
}

// Supprimer une réponse individuelle
async function deleteSurveyResponse(id) {
    if (!confirm("Voulez-vous vraiment supprimer cette réponse de participant ?")) return;

    try {
        const { error } = await supabaseClient
            .from('survey_responses')
            .delete()
            .eq('id', id);

        if (error) throw error;

        showToast("Réponse supprimée avec succès.", "success");
        loadAdminDashboard();
    } catch (e) {
        console.error("Delete response error:", e);
        showToast("Erreur lors de la suppression.", "error");
    }
}

// Réinitialiser complètement la base de données
async function confirmResetDatabase() {
    const code = prompt("ATTENTION: Cette action va effacer TOUTES les réponses des participants et réinitialiser les nuages de mots. Tapez 'RESET' pour confirmer :");
    if (code !== 'RESET') {
        if (code !== null) showToast("Réinitialisation annulée.", "info");
        return;
    }

    try {
        // 1. Vider survey_responses
        const { error: error1 } = await supabaseClient
            .from('survey_responses')
            .delete()
            .neq('profile', 'dummy'); // Suppression totale de toutes les lignes

        // 2. Vider word_cloud_inputs
        const { error: error2 } = await supabaseClient
            .from('word_cloud_inputs')
            .delete()
            .neq('question_id', 'dummy'); // Suppression totale

        if (error1 || error2) throw new Error("Erreur lors de la purge.");

        // Ré-ensemencer les propositions initiales avec 0 vote
        await seedDefaultWords(true);

        showToast("Base de données entièrement réinitialisée !", "success");
        
        // Recharger le tableau de bord
        loadAdminDashboard();
    } catch (e) {
        console.error("Reset error:", e);
        showToast("Erreur lors de la réinitialisation de la DB.", "error");
    }
}

// Exporter les données sous format CSV lisible par Excel
function exportDataToCSV() {
    if (surveyResponsesList.length === 0) {
        showToast("Aucune donnée à exporter.", "info");
        return;
    }

    let csvContent = "";
    
    // Ajout du BOM UTF-8 pour Excel afin d'afficher les accents correctement
    csvContent += "\uFEFF";

    // En-tête
    csvContent += "Date Soumission;Profil Rôle;Usages recherchés (Contextes d'Usage);Attentes de la formation;Outils IA déjà utilisés\n";

    // Lignes
    surveyResponsesList.forEach(r => {
        const dateStr = new Date(r.created_at).toLocaleString('fr-FR');
        const profile = r.profile ? `"${r.profile.replace(/"/g, '""')}"` : "";
        const contexts = r.usage_contexts ? `"${r.usage_contexts.join(', ').replace(/"/g, '""')}"` : "";
        
        let attentes = "";
        let outils = "";
        if (r.interests) {
            if (Array.isArray(r.interests.attentes)) {
                attentes = r.interests.attentes.join(', ');
            }
            if (Array.isArray(r.interests.outils)) {
                outils = r.interests.outils.join(', ');
            }
        }
        
        csvContent += `${dateStr};${profile};${contexts};"${attentes.replace(/"/g, '""')}";"${outils.replace(/"/g, '""')}"\n`;
    });

    // Création du lien de téléchargement
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `sondage_formation_ia_cnfpt_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast("Fichier CSV exporté !", "success");
}

// =========================================================================
// UTILITAIRES & NOTIFICATIONS
// =========================================================================

// Système de notification Toast temporaire
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';

    toast.innerHTML = `
        <span style="font-size:1.1rem">${icon}</span>
        <div>${escapeHTML(message)}</div>
    `;

    container.appendChild(toast);
    
    // Animation d'entrée
    setTimeout(() => toast.classList.add('show'), 50);

    // Suppression après 4 secondes
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Échapper le HTML pour éviter les failles XSS
function escapeHTML(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Générateur d'UUID compatible
function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Nettoyage et normalisation des mots saisis dans le nuage
function sanitizeAndCleanWord(word) {
    if (!word) return null;
    
    // Nettoyer les espaces multiples et mettre en minuscules
    let w = word.trim().toLowerCase().replace(/\s+/g, ' ');
    
    // Liste des mots vides (stop words) en français
    const stopWords = [
        'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'en', 'pour', 
        'et', 'ou', 'sur', 'avec', 'dans', 'par', 'ce', 'ces', 'ma', 'mon', 
        'mes', 'ta', 'ton', 'tes', 'sa', 'son', 'ses', 'au', 'aux', 'd', 
        'l', 'qu', 'que', 'qui', 'se', 'sa', 'son', 'je', 'tu', 'il', 'nous',
        'vous', 'ils', 'elle', 'elles'
    ];
    
    // Si c'est un mot vide seul, on l'ignore
    if (stopWords.includes(w)) {
        return null;
    }

    // Retirer la ponctuation simple en début/fin de mot
    w = w.replace(/^[^a-zA-Z0-9À-ÿ]+|[^a-zA-Z0-9À-ÿ]+$/g, '');

    if (!w) return null;

    // Harmonisation esthétique pour les outils connus
    const specialCases = {
        'chatgpt': 'ChatGPT',
        'midjourney': 'Midjourney',
        'copilot': 'Copilot',
        'gemini': 'Gemini',
        'claude': 'Claude',
        'dall-e': 'DALL-E',
        'dalle': 'DALL-E',
        'canva': 'Canva',
        'heygen': 'HeyGen',
        'suno': 'Suno',
        'udio': 'Udio'
    };

    if (specialCases[w]) {
        return specialCases[w];
    }

    // Capitaliser la première lettre
    return w.charAt(0).toUpperCase() + w.slice(1);
}

// Auto-seeding des mots par défaut si vides dans la DB (0 vote par défaut)
async function seedDefaultWords(force = false) {
    if (!supabaseClient) return;
    try {
        // 1. Seed usages
        let shouldSeedUsages = force;
        if (!shouldSeedUsages) {
            const { data: usagesData, error: usagesError } = await supabaseClient
                .from('word_cloud_inputs')
                .select('id')
                .eq('question_id', 'usages')
                .limit(1);
            shouldSeedUsages = !usagesError && (!usagesData || usagesData.length === 0);
        }
        if (shouldSeedUsages) {
            const defaultUsages = [
                "Rédaction de courriers & rapports",
                "Synthèse de documents & notes",
                "Recherche d'informations & veille",
                "Analyse de données & chiffres",
                "Création de visuels & diaporamas",
                "Aide au codage & automatisation",
                "Brainstorming & idées de projets"
            ].map(word => ({
                question_id: 'usages',
                word: word,
                votes: 0
            }));
            await supabaseClient.from('word_cloud_inputs').insert(defaultUsages);
        }

        // 2. Seed attentes
        let shouldSeedAttentes = force;
        if (!shouldSeedAttentes) {
            const { data: attentesData, error: attentesError } = await supabaseClient
                .from('word_cloud_inputs')
                .select('id')
                .eq('question_id', 'attentes')
                .limit(1);
            shouldSeedAttentes = !attentesError && (!attentesData || attentesData.length === 0);
        }
        if (shouldSeedAttentes) {
            const defaultAttentes = [
                "Pratique & cas concrets",
                "Gagner du temps",
                "Comprendre les limites",
                "Sécurité & RGPD",
                "Rédiger de bons prompts",
                "Découvrir de nouveaux outils"
            ].map(word => ({
                question_id: 'attentes',
                word: word,
                votes: 0
            }));
            await supabaseClient.from('word_cloud_inputs').insert(defaultAttentes);
        }

        // 3. Seed outils
        let shouldSeedOutils = force;
        if (!shouldSeedOutils) {
            const { data: outilsData, error: outilsError } = await supabaseClient
                .from('word_cloud_inputs')
                .select('id')
                .eq('question_id', 'outils')
                .limit(1);
            shouldSeedOutils = !outilsError && (!outilsData || outilsData.length === 0);
        }
        if (shouldSeedOutils) {
            const defaultOutils = [
                "ChatGPT",
                "Copilot",
                "Gemini",
                "Claude",
                "Midjourney",
                "Canva"
            ].map(word => ({
                question_id: 'outils',
                word: word,
                votes: 0
            }));
            await supabaseClient.from('word_cloud_inputs').insert(defaultOutils);
        }
    } catch (e) {
        console.warn("Seeding default words ignored (already seeded or connection error):", e);
    }
}

