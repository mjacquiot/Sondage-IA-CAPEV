// =========================================================================
// LOGIQUE APPLICATIVE - FORMATION IA CNFPT
// =========================================================================

// Configuration Supabase
const supabaseUrl = 'https://hkqawuxumimkainegqln.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcWF3dXh1bWlta2FpbmVncWxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMzAxNzcsImV4cCI6MjA5NzcwNjE3N30.0CaEReFJcbPXk_3sI8nRdy8iU9Sl0n4S3VDbiw3Q7p8';
let supabase = null;

// Variables d'état global
let currentStep = 1;
const totalSteps = 5;
let selectedProfile = '';
let selectedContexts = [];
let interests = {
    fonctionnement: 0,
    prompt: 0,
    securite: 0,
    hallucinations: 0,
    outils: 0
};
let wordCloudsData = {
    attentes: [],
    outils: []
};
let surveyResponsesList = [];
let refreshInterval = null;

// Initialisation au chargement du DOM
document.addEventListener('DOMContentLoaded', () => {
    try {
        // Initialisation du client Supabase
        supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
    } catch (e) {
        showToast("Erreur d'initialisation de Supabase. Vérifiez votre connexion.", "error");
        console.error("Supabase init error:", e);
    }

    // Gestion du routage SPA
    window.addEventListener('hashchange', handleRouting);
    handleRouting();

    // Configuration des écouteurs d'événements UI
    setupEventListeners();
    
    // Vérification de session admin existante
    checkAdminSession();
});

// =========================================================================
// ROUTAGE SPA
// =========================================================================

async function handleRouting() {
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
    if (hash === '#programme') {
        document.getElementById('view-programme').classList.add('active-view');
        document.querySelector('[href="#programme"]')?.classList.add('active');
    } 
    else if (hash === '#sondage') {
        // Si le sondage est déjà complété, on redirige vers l'écran de remerciement/résultat
        if (localStorage.getItem('survey_completed') === 'true') {
            document.getElementById('view-sondage').classList.add('active-view');
            showSurveySuccessView();
        } else {
            document.getElementById('view-sondage').classList.add('active-view');
            resetSurveyWizard();
        }
        document.querySelector('[href="#sondage"]')?.classList.add('active');
    } 
    else if (hash === '#admin') {
        const session = await getSession();
        if (session) {
            document.getElementById('view-admin').classList.add('active-view');
            loadAdminDashboard();
        } else {
            // Si pas connecté, rediriger vers le programme et ouvrir la modale de login
            window.location.hash = '#programme';
            openLoginModal();
        }
    }
}

// =========================================================================
// ÉCOUTEURS D'ÉVÉNEMENTS GÉNÉRAUX
// =========================================================================

function setupEventListeners() {
    // Boutons de navigation du sondage
    document.getElementById('btn-prev').addEventListener('click', prevStep);
    document.getElementById('btn-next').addEventListener('click', nextStep);

    // Écouteurs pour l'étape 1 : Profils
    document.querySelectorAll('.profile-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.profile-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedProfile = card.dataset.profile;
            document.getElementById('btn-next').disabled = false;
        });
    });

    // Écouteurs pour l'étape 2 : Contextes
    document.querySelectorAll('.context-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            chip.classList.toggle('selected');
            const context = chip.dataset.context;
            if (chip.classList.contains('selected')) {
                selectedContexts.push(context);
            } else {
                selectedContexts = selectedContexts.filter(c => c !== context);
            }
            // Au moins 1 contexte requis pour avancer
            document.getElementById('btn-next').disabled = selectedContexts.length === 0;
        });
    });

    // Écouteurs pour les nuages de mots (Ajout par input)
    document.getElementById('btn-add-attente').addEventListener('click', () => {
        submitNewWord('attentes', 'input-attente');
    });
    document.getElementById('input-attente').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') submitNewWord('attentes', 'input-attente');
    });

    document.getElementById('btn-add-outil').addEventListener('click', () => {
        submitNewWord('outils', 'input-outil');
    });
    document.getElementById('input-outil').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') submitNewWord('outils', 'input-outil');
    });

    // Écouteurs pour l'étape 5 : Évaluation des intérêts (Étoiles)
    document.querySelectorAll('.interest-stars').forEach(container => {
        const topic = container.dataset.topic;
        const stars = container.querySelectorAll('.star');
        stars.forEach(star => {
            star.addEventListener('click', () => {
                const val = parseInt(star.dataset.value);
                interests[topic] = val;
                
                // Mettre à jour visuellement les étoiles
                stars.forEach(s => {
                    const sVal = parseInt(s.dataset.value);
                    if (sVal <= val) {
                        s.classList.add('active');
                        s.textContent = '★';
                    } else {
                        s.classList.remove('active');
                        s.textContent = '☆';
                    }
                });

                // Vérifier si toutes les évaluations ont été faites
                checkStep5Validity();
            });
        });
    });

    // Bouton cadenas discret
    document.getElementById('btn-open-login').addEventListener('click', openLoginModal);

    // Modale de connexion Admin
    document.getElementById('btn-cancel-login').addEventListener('click', closeLoginModal);
    document.getElementById('btn-submit-login').addEventListener('click', submitLogin);
    document.getElementById('input-admin-password').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') submitLogin();
    });

    // Actions d'administration
    document.getElementById('btn-logout').addEventListener('click', handleLogout);
    document.getElementById('btn-export-csv').addEventListener('click', exportDataToCSV);
    document.getElementById('btn-reset-db').addEventListener('click', confirmResetDatabase);
}

// =========================================================================
// LOGIQUE DU SONDAGE PAR ÉTAPES (WIZARD)
// =========================================================================

function resetSurveyWizard() {
    currentStep = 1;
    selectedProfile = '';
    selectedContexts = [];
    interests = { fonctionnement: 0, prompt: 0, securite: 0, hallucinations: 0, outils: 0 };
    
    // Reset DOM
    document.querySelectorAll('.profile-card').forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('.context-chip').forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('.star').forEach(s => {
        s.classList.remove('active');
        s.textContent = '☆';
    });
    document.getElementById('input-attente').value = '';
    document.getElementById('input-outil').value = '';

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
        checkStep5Validity();
    } else {
        document.getElementById('btn-next').innerHTML = 'Suivant <span style="font-size:1.1rem">→</span>';
        // Validation dynamique selon l'étape
        if (currentStep === 1) {
            document.getElementById('btn-next').disabled = !selectedProfile;
        } else if (currentStep === 2) {
            document.getElementById('btn-next').disabled = selectedContexts.length === 0;
        } else {
            document.getElementById('btn-next').disabled = false;
        }
    }

    // Gérer l'actualisation en temps réel des nuages de mots sur les étapes correspondantes
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }

    if (currentStep === 3) {
        loadWordCloud('attentes');
        refreshInterval = setInterval(() => loadWordCloud('attentes', true), 15000); // toutes les 15s
    } else if (currentStep === 4) {
        loadWordCloud('outils');
        refreshInterval = setInterval(() => loadWordCloud('outils', true), 15000); // toutes les 15s
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

function checkStep5Validity() {
    const allRated = Object.values(interests).every(val => val > 0);
    document.getElementById('btn-next').disabled = !allRated;
}

// =========================================================================
// GESTION DES NUAGES DE MOTS (WORD CLOUD)
// =========================================================================

// Charger les mots depuis la DB
async function loadWordCloud(questionId, isSilent = false) {
    if (!supabase) return;
    
    try {
        const { data, error } = await supabase
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

// Rendu HTML du nuage de mots
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
        
        // Vérifier si l'utilisateur a déjà voté pour ce mot sur cet appareil
        const storageKey = `voted_${questionId}_${item.word.toLowerCase()}`;
        const hasVoted = localStorage.getItem(storageKey) === 'true';
        
        if (hasVoted) {
            bubble.classList.add('voted');
        }

        // Calculer une taille proportionnelle (min: 0.85rem, max: 2.2rem)
        let fontSize = 0.9;
        if (maxVotes > 1) {
            // Echelle logarithmique ou linéaire douce
            fontSize = 0.9 + (item.votes - 1) / (maxVotes - 1) * 1.3;
        }
        bubble.style.fontSize = `${fontSize}rem`;

        // Style selon la popularité (couleurs plus vives pour les mots populaires)
        if (item.votes > maxVotes * 0.7) {
            bubble.style.borderColor = 'var(--color-accent)';
            bubble.style.background = 'rgba(6, 182, 212, 0.08)';
        } else if (item.votes > maxVotes * 0.4) {
            bubble.style.borderColor = 'var(--color-primary-light)';
        }

        // Structure HTML
        bubble.innerHTML = `
            <span class="word-text">${escapeHTML(item.word)}</span>
            <span class="word-count">${item.votes}</span>
        `;

        // Événement clic pour voter
        if (!hasVoted) {
            bubble.addEventListener('click', () => voteForWord(questionId, item.word, item.votes));
        }

        container.appendChild(bubble);
    });
}

// Soumission d'un nouveau mot
async function submitNewWord(questionId, inputId) {
    const input = document.getElementById(inputId);
    let word = input.value.trim();
    if (!word) return;

    // Nettoyage et formatage simple
    word = word.replace(/\s+/g, ' ');
    if (word.length > 25) {
        showToast("Le mot ou l'expression est trop long (max 25 car.)", "info");
        return;
    }

    const wordLower = word.toLowerCase();
    
    // Vérifier si le mot existe déjà localement dans le nuage
    const existing = wordCloudsData[questionId].find(w => w.word.toLowerCase() === wordLower);
    
    if (existing) {
        // Si existe déjà, on vote automatiquement pour
        const storageKey = `voted_${questionId}_${existing.word.toLowerCase()}`;
        if (localStorage.getItem(storageKey) === 'true') {
            showToast(`Vous avez déjà voté pour "${existing.word}"`, "info");
        } else {
            voteForWord(questionId, existing.word, existing.votes);
        }
        input.value = '';
        return;
    }

    try {
        // Insérer dans la base de données
        const { error } = await supabase
            .from('word_cloud_inputs')
            .insert([{ question_id: questionId, word: word, votes: 1 }]);

        if (error) throw error;

        // Marquer comme voté localement
        localStorage.setItem(`voted_${questionId}_${wordLower}`, 'true');
        
        input.value = '';
        showToast(`"${word}" a été ajouté !`, "success");
        
        // Recharger le nuage
        await loadWordCloud(questionId);
    } catch (e) {
        console.error("Error inserting word:", e);
        showToast("Erreur lors de l'ajout du mot.", "error");
    }
}

// Voter pour un mot existant
async function voteForWord(questionId, word, currentVotes) {
    const wordLower = word.toLowerCase();
    const storageKey = `voted_${questionId}_${wordLower}`;
    
    if (localStorage.getItem(storageKey) === 'true') return;

    try {
        const { error } = await supabase
            .from('word_cloud_inputs')
            .update({ votes: currentVotes + 1 })
            .eq('question_id', questionId)
            .eq('word', word);

        if (error) throw error;

        // Enregistrer le vote localement
        localStorage.setItem(storageKey, 'true');
        showToast("Vote enregistré !", "success");

        // Recharger immédiatement le nuage
        await loadWordCloud(questionId);
    } catch (e) {
        console.error("Error voting:", e);
        showToast("Erreur lors de l'enregistrement du vote.", "error");
    }
}

// =========================================================================
// SOUMISSION FINALE DU SONDAGE
// =========================================================================

async function submitSurvey() {
    if (!supabase) return;
    
    // Loader sur le bouton
    const btn = document.getElementById('btn-next');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Envoi... <span class="spinner">⏳</span>';

    const surveyData = {
        profile: selectedProfile,
        usage_contexts: selectedContexts,
        interests: interests
    };

    try {
        const { error } = await supabase
            .from('survey_responses')
            .insert([surveyData]);

        if (error) throw error;

        // Enregistrer la complétion du sondage dans le localStorage
        localStorage.setItem('survey_completed', 'true');
        
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

    // Charger et afficher les deux nuages en mode lecture seule
    await loadWordCloud('attentes');
    await loadWordCloud('outils');
    
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
        bubble.className = 'word-bubble voted'; // class voted pour masquer l'interactivité
        
        let fontSize = 0.9;
        if (maxVotes > 1) {
            fontSize = 0.9 + (item.votes - 1) / (maxVotes - 1) * 1.3;
        }
        bubble.style.fontSize = `${fontSize}rem`;

        if (item.votes > maxVotes * 0.7) {
            bubble.style.borderColor = 'var(--color-accent)';
            bubble.style.background = 'rgba(6, 182, 212, 0.08)';
        }

        bubble.innerHTML = `
            <span class="word-text">${escapeHTML(item.word)}</span>
            <span class="word-count">${item.votes}</span>
        `;

        container.appendChild(bubble);
    });
}

// Permettre à l'utilisateur de refaire le sondage (Utile pour le formateur ou tests)
function debugResetSurvey() {
    localStorage.removeItem('survey_completed');
    // Nettoyer aussi les votes pour pouvoir retester
    for (let key in localStorage) {
        if (key.startsWith('voted_')) {
            localStorage.removeItem(key);
        }
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
        document.getElementById('btn-open-login').style.color = 'rgba(255, 255, 255, 0.15)';
    }
}

async function getSession() {
    if (!supabase) return null;
    try {
        const { data, error } = await supabase.auth.getSession();
        if (error) return null;
        return data?.session;
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
        const { data, error } = await supabase.auth.signInWithPassword({
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
    if (!supabase) return;
    try {
        await supabase.auth.signOut();
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
    if (!supabase) return;

    try {
        // 1. Charger toutes les réponses au sondage
        const { data: responses, error: rError } = await supabase
            .from('survey_responses')
            .select('*')
            .order('created_at', { ascending: false });

        if (rError) throw rError;
        surveyResponsesList = responses || [];

        // 2. Charger les nuages de mots
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

    if (total === 0) {
        document.getElementById('stat-profiles-list').innerHTML = '<div class="word-cloud-empty">Aucune donnée.</div>';
        document.getElementById('stat-contexts-list').innerHTML = '<div class="word-cloud-empty">Aucune donnée.</div>';
        document.getElementById('stat-interests-list').innerHTML = '<div class="word-cloud-empty">Aucune donnée.</div>';
        return;
    }

    // --- ANALYSE DES PROFILS ---
    const profileCounts = {};
    surveyResponsesList.forEach(r => {
        profileCounts[r.profile] = (profileCounts[r.profile] || 0) + 1;
    });

    let profilesHTML = '';
    const sortedProfiles = Object.entries(profileCounts).sort((a, b) => b[1] - a[1]);
    sortedProfiles.forEach(([prof, count]) => {
        const pct = ((count / total) * 100).toFixed(0);
        profilesHTML += `
            <div class="stat-bar-row">
                <div class="stat-bar-labels">
                    <span class="stat-bar-label-name">${escapeHTML(prof)}</span>
                    <span>${count} (${pct}%)</span>
                </div>
                <div class="stat-bar-track">
                    <div class="stat-bar-fill" style="width: ${pct}%"></div>
                </div>
            </div>
        `;
    });
    document.getElementById('stat-profiles-list').innerHTML = profilesHTML;

    // --- ANALYSE DES CONTEXTES ---
    const contextCounts = {};
    surveyResponsesList.forEach(r => {
        if (r.usage_contexts && Array.isArray(r.usage_contexts)) {
            r.usage_contexts.forEach(ctx => {
                contextCounts[ctx] = (contextCounts[ctx] || 0) + 1;
            });
        }
    });

    let contextsHTML = '';
    const sortedContexts = Object.entries(contextCounts).sort((a, b) => b[1] - a[1]);
    sortedContexts.forEach(([ctx, count]) => {
        const pct = ((count / total) * 100).toFixed(0);
        contextsHTML += `
            <div class="stat-bar-row">
                <div class="stat-bar-labels">
                    <span class="stat-bar-label-name">${escapeHTML(ctx)}</span>
                    <span>${count} (${pct}%)</span>
                </div>
                <div class="stat-bar-track">
                    <div class="stat-bar-fill" style="width: ${pct}%"></div>
                </div>
            </div>
        `;
    });
    document.getElementById('stat-contexts-list').innerHTML = contextsHTML;

    // --- ANALYSE DES INTÉRÊTS (MOYENNES DES SUJETS DU PROGRAMME) ---
    const interestSums = { fonctionnement: 0, prompt: 0, securite: 0, hallucinations: 0, outils: 0 };
    surveyResponsesList.forEach(r => {
        if (r.interests) {
            for (let topic in interestSums) {
                interestSums[topic] += parseFloat(r.interests[topic] || 0);
            }
        }
    });

    const labelsMap = {
        fonctionnement: "Fonctionnement IA",
        prompt: "L'art du Prompting",
        securite: "Sécurité & Réglementation",
        hallucinations: "Fiabilité & Hallucinations",
        outils: "Panorama des Outils"
    };

    let interestsHTML = '';
    for (let topic in interestSums) {
        const avg = (interestSums[topic] / total).toFixed(1);
        const pct = ((parseFloat(avg) / 5) * 100).toFixed(0);
        interestsHTML += `
            <div class="stat-bar-row">
                <div class="stat-bar-labels">
                    <span class="stat-bar-label-name">${labelsMap[topic]}</span>
                    <span>Moyenne : ${avg} / 5</span>
                </div>
                <div class="stat-bar-track">
                    <div class="stat-bar-fill" style="width: ${pct}%; background: linear-gradient(to right, var(--color-purple-light), var(--color-purple))"></div>
                </div>
            </div>
        `;
    }
    document.getElementById('stat-interests-list').innerHTML = interestsHTML;
}

// Rendu des nuages de mots avec outils de modération (Suppression)
function renderAdminClouds() {
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
        const { error } = await supabase
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
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem; color: var(--text-muted-light);">Aucune réponse enregistrée pour le moment.</td></tr>';
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

        // Formater les intérêts sous forme condensée
        let interestsStr = '';
        if (r.interests) {
            interestsStr = Object.entries(r.interests)
                .map(([k, v]) => `${k.substring(0,4)}:${v}/5`)
                .join(' | ');
        }

        tr.innerHTML = `
            <td style="font-weight: 600; color:var(--text-light)">${dateStr}</td>
            <td style="color: var(--color-accent); font-weight: 500;">${escapeHTML(r.profile)}</td>
            <td>${escapeHTML(contextsStr)}</td>
            <td style="font-size:0.8rem; font-family: monospace;">${escapeHTML(interestsStr)}</td>
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
        const { error } = await supabase
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
        const { error: error1 } = await supabase
            .from('survey_responses')
            .delete()
            .neq('profile', 'dummy'); // Suppression totale de toutes les lignes

        // 2. Vider word_cloud_inputs
        const { error: error2 } = await supabase
            .from('word_cloud_inputs')
            .delete()
            .neq('question_id', 'dummy'); // Suppression totale

        if (error1 || error2) throw new Error("Erreur lors de la purge.");

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
    csvContent += "Date Soumission;Profil Rôle;Contextes d'Usage IA;Fonctionnement IA (Note);Prompting (Note);Sécurité & Réglementation (Note);Hallucinations (Note);Panorama des Outils (Note)\n";

    // Lignes
    surveyResponsesList.forEach(r => {
        const dateStr = new Date(r.created_at).toLocaleString('fr-FR');
        const profile = r.profile ? `"${r.profile.replace(/"/g, '""')}"` : "";
        const contexts = r.usage_contexts ? `"${r.usage_contexts.join(', ').replace(/"/g, '""')}"` : "";
        
        const f = r.interests?.fonctionnement || 0;
        const p = r.interests?.prompt || 0;
        const s = r.interests?.securite || 0;
        const h = r.interests?.hallucinations || 0;
        const o = r.interests?.outils || 0;

        csvContent += `${dateStr};${profile};${contexts};${f};${p};${s};${h};${o}\n`;
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
