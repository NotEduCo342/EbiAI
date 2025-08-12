// public/js/brainstormer.js
document.addEventListener('DOMContentLoaded', () => {
    const questionList = document.getElementById('question-list');
    const questionCount = document.getElementById('question-count');
    const searchBar = document.getElementById('search-bar');
    const bulkBrainstormBtn = document.getElementById('bulk-brainstorm-btn');
    const bulkIgnoreBtn = document.getElementById('bulk-ignore-btn');
    const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
    
    const reviewModal = document.getElementById('review-modal');
    const responseForm = document.getElementById('add-response-form');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const modalStatus = document.getElementById('modal-status');

    let allQuestions = [];

    const performFileAction = async (action, questions) => {
        try {
            const response = await fetch('/api/unanswered-questions/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, questions }),
            });
            const result = await response.json();
            if (!result.success) {
                alert(`Error: ${result.error}`);
            }
            fetchAndRenderQuestions();
        } catch (err) {
            alert(`Failed to perform action: ${err.message}`);
        }
    };
    
    const brainstormQuestion = async (question, useSearch) => {
        modalStatus.textContent = '🧠 Brainstorming...';
        modalStatus.className = 'status-message';
        reviewModal.style.display = 'flex';

        let endpoint = '/api/brainstorm';
        let body = { question };

        try {
            if (useSearch) {
                modalStatus.textContent = '🔍 Performing web search first...';
                const searchRes = await fetch('/api/manual-search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ question }),
                });
                const searchResult = await searchRes.json();
                if (!searchResult.success) throw new Error(searchResult.error);
                if (!searchResult.data) throw new Error("No search result found to provide context.");

                modalStatus.textContent = '🧠 Search complete. Brainstorming with context...';
                endpoint = '/api/brainstorm-with-context';
                body = { question, context: searchResult.data };
            }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const result = await response.json();

            if (result.success) {
                responseForm.querySelector('#trigger').value = result.data.trigger.join('\n');
                responseForm.querySelector('#response').value = result.data.response.join('\n');
                // --- THIS IS THE FIX ---
                responseForm.querySelector('#display-matchType').value = result.data.matchType;
                responseForm.querySelector('#display-type').value = result.data.type;
                responseForm.querySelector('#matchType').value = result.data.matchType;
                responseForm.querySelector('#type').value = result.data.type;
                responseForm.querySelector('#excludeWords').value = JSON.stringify(result.data.excludeWords || []);
                
                modalStatus.textContent = 'Review the AI suggestions below.';
            } else {
                throw new Error(result.error);
            }
        } catch (err) {
            modalStatus.className = 'status-message error';
            modalStatus.textContent = `Error: ${err.message}`;
        }
    };
    
    const renderQuestions = (questionsToRender) => {
        questionList.innerHTML = '';
        if (questionsToRender.length === 0) {
            questionList.innerHTML = '<li>No unanswered questions found.</li>';
            return;
        }

        questionsToRender.forEach(question => {
            const li = document.createElement('li');
            li.className = 'question-item';
            li.dataset.question = question;

            li.innerHTML = `
                <input type="checkbox" class="question-checkbox" title="Select for bulk actions">
                <span class="question-text">${question}</span>
                <div class="question-actions">
                    <input type="checkbox" class="use-search-checkbox" title="Use Web Search context for this brainstorm"> Search
                    <button class="brainstorm-btn">Brainstorm</button>
                    <button class="ignore-btn">Ignore</button>
                    <button class="delete-btn">Delete</button>
                </div>
            `;
            questionList.appendChild(li);
        });
    };

    const fetchAndRenderQuestions = async () => {
        try {
            const response = await fetch('/api/unanswered-questions');
            const data = await response.json();
            if (data.success) {
                allQuestions = data.questions;
                questionCount.textContent = allQuestions.length;
                const searchTerm = searchBar.value.toLowerCase();
                const filteredQuestions = allQuestions.filter(q => q.toLowerCase().includes(searchTerm));
                renderQuestions(filteredQuestions);
            } else {
                questionList.innerHTML = `<li>Error: ${data.error}</li>`;
            }
        } catch (error) {
            questionList.innerHTML = `<li>Error fetching questions: ${error.message}</li>`;
        }
    };

    searchBar.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredQuestions = allQuestions.filter(q => q.toLowerCase().includes(searchTerm));
        renderQuestions(filteredQuestions);
    });

    questionList.addEventListener('click', (e) => {
        const target = e.target;
        const parentLi = target.closest('.question-item');
        if (!parentLi) return;

        const question = parentLi.dataset.question;

        if (target.classList.contains('delete-btn')) {
            if (confirm(`Are you sure you want to delete this question?\n\n"${question}"`)) {
                performFileAction('delete', [question]);
            }
        } else if (target.classList.contains('ignore-btn')) {
            performFileAction('ignore', [question]);
        } else if (target.classList.contains('brainstorm-btn')) {
            const useSearch = parentLi.querySelector('.use-search-checkbox').checked;
            brainstormQuestion(question, useSearch);
        }
    });
    
    const getSelectedQuestions = () => {
        const selected = [];
        questionList.querySelectorAll('.question-checkbox:checked').forEach(checkbox => {
            selected.push(checkbox.closest('.question-item').dataset.question);
        });
        return selected;
    };

    bulkDeleteBtn.addEventListener('click', () => {
        const selected = getSelectedQuestions();
        if (selected.length === 0) return alert('Please select at least one question to delete.');
        if (confirm(`Are you sure you want to delete ${selected.length} questions?`)) {
            performFileAction('delete', selected);
        }
    });

    bulkIgnoreBtn.addEventListener('click', () => {
        const selected = getSelectedQuestions();
        if (selected.length === 0) return alert('Please select at least one question to ignore.');
        performFileAction('ignore', selected);
    });

    bulkBrainstormBtn.addEventListener('click', () => {
        const selected = getSelectedQuestions();
        if (selected.length === 0) return alert('Please select at least one question to brainstorm.');
        alert(`Starting to brainstorm for ${selected.length} questions. This will be done one by one.`);
        if (selected.length > 0) {
            brainstormQuestion(selected[0], false); 
        }
    });

    responseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        modalStatus.textContent = 'Saving to database...';
        modalStatus.className = 'status-message';

        const formData = new FormData(responseForm);
        const data = Object.fromEntries(formData.entries());

        try {
            const response = await fetch('/api/responses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            const result = await response.json();

            if (result.success) {
                modalStatus.className = 'status-message success';
                modalStatus.textContent = 'Response added successfully!';
                
                const originalQuestion = data.trigger.split('\n')[0];
                await performFileAction('delete', [originalQuestion]);

                setTimeout(() => {
                    reviewModal.style.display = 'none';
                    responseForm.reset();
                }, 1500);
            } else {
                modalStatus.className = 'status-message error';
                modalStatus.textContent = `Error: ${result.error}`;
            }
        } catch (err) {
            modalStatus.className = 'status-message error';
            modalStatus.textContent = `Failed to save: ${err.message}`;
        }
    });

    closeModalBtn.addEventListener('click', () => {
        reviewModal.style.display = 'none';
        responseForm.reset();
        modalStatus.textContent = '';
    });

    fetchAndRenderQuestions();
});