document.addEventListener('DOMContentLoaded', () => {
    // --- Lấy các phần tử DOM ---
    const videoContainer = document.getElementById('video-container');
    const video = document.getElementById('video-player');
    const inputOverlay = document.getElementById('input-overlay');
    const videoUrlInput = document.getElementById('video-url');
    const videoUpload = document.getElementById('video-upload');
    const subtitleUpload = document.getElementById('subtitle-upload');
    const subtitlesDiv = document.getElementById('subtitles');
    const subtitleDisplay = document.getElementById('subtitle-display');
    const translationPopup = document.getElementById('translation-popup');
    const popupContent = document.getElementById('popup-content');
    const errorMessage = document.getElementById('error-message');
    const setLoopStartElement = document.getElementById('set-loop-start');
    const setLoopEndElement = document.getElementById('set-loop-end');
    const loopStartElement = document.getElementById('loop-start-display');
    const loopEndElement = document.getElementById('loop-end-display');
    const addLoopElement = document.getElementById('add-loop');
    const toggleLoopElement = document.getElementById('toggle-loop');
    const toggleSubtitlesElement = document.getElementById('toggle-subtitles');
    const clearDataElement = document.getElementById('clear-data');
    const loopListElement = document.getElementById('loop-list');
    const loopMarkersElement = document.getElementById('loop-markers');
    const rewindBtn = document.getElementById('rewind-btn');
    const forwardBtn = document.getElementById('forward-btn');
    const seekSecondsInput = document.getElementById('seek-seconds');
    const closePopupBtn = document.querySelector('#translation-popup .close-btn');
    const fullscreenBtn = document.getElementById('fullscreen-btn');

    // --- Biến trạng thái ---
    let subtitles = [];
    let currentSentence = '';
    let isVideoLoaded = false;
    let isSubtitlesLoaded = false;
    let loopStart = 0;
    let loopEnd = 0;
    let loops = [];
    let isLooping = false;
    let subtitleEnabled = true;
    const debounceDelay = 100;

    // --- TÍCH HỢP GIẢI MÃ API KEY ---
    const secretKey = 'mysecretkey';
    const encodedApiKeys = [
      'LDAJBDALJBcdCBMlNgQyKD89GFxQKz4PJRBUJFABJRYBIBJBUS4R',
      'LDAJBDALJEQBLAkVPQsBKRoJPSU3TwNKAgYIOVcHLV0xVSoEKCkZ',
    ];
    let currentApiKeyIndex = 0;
    function decodeApiKey(encodedStr, key) {
        try {
            const xorResult = atob(encodedStr);
            return Array.from(xorResult)
                .map((char, i) => String.fromCharCode(char.charCodeAt(0) ^ key.charCodeAt(i % key.length)))
                .join('');
        } catch (e) {
            console.error("Lỗi giải mã API key.", e);
            return "";
        }
    }

    // =================================================================
    // CHỨC NĂNG CỐT LÕI
    // =================================================================
    function debounce(func, delay) {
      let timeoutId;
      return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func(...args), delay);
      };
    }
    function formatTime(seconds) {
        if (isNaN(seconds)) return '00:00';
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        setTimeout(() => {
            errorMessage.style.display = 'none';
        }, 4000);
    }
    function parseSRT(data) {
        try {
            let normalizedData = data.replace(/\uFEFF/g, '').replace(/\r\n|\r|\n/g, '\n').trim();
            const blocks = normalizedData.split(/\n\n+/).filter(block => block.trim());
            if (!blocks.length) throw new Error('File SRT trống hoặc không chứa khối hợp lệ.');
            const parsedSubtitles = [];
            blocks.forEach((block) => {
                const lines = block.split('\n').filter(line => line.trim());
                if (lines.length < 2) return;
                let timeLineIndex = lines.findIndex(line => line.includes(' --> '));
                if (timeLineIndex === -1) return;
                const timeLine = lines[timeLineIndex];
                const contentLines = lines.slice(timeLineIndex + 1).filter(line => line.trim());
                if (!contentLines.length) return;
                const [start, end] = timeLine.split(' --> ').map(t => {
                    const timeStr = t.replace(',', '.').trim();
                    const parts = timeStr.split(':');
                    const h = parseInt(parts[0], 10);
                    const m = parseInt(parts[1], 10);
                    const s = parseFloat(parts[2]);
                    if (isNaN(h) || isNaN(m) || isNaN(s)) return NaN;
                    return h * 3600 + m * 60 + s;
                });
                if (isNaN(start) || isNaN(end) || start >= end) return;
                parsedSubtitles.push({ startTime: start, endTime: end, contentLines });
            });
            if (!parsedSubtitles.length) throw new Error('Không tìm thấy khối phụ đề hợp lệ nào.');
            return parsedSubtitles;
        } catch (error) {
            showError(`Lỗi phân tích file SRT: ${error.message}`);
            return [];
        }
    }
    const updateSubtitles = debounce(() => {
        if (!subtitleEnabled || !isSubtitlesLoaded || video.paused) {
            return;
        }
        const currentTime = video.currentTime;
        const currentSubtitle = subtitles.find(sub => sub.startTime <= currentTime && currentTime <= sub.endTime);
        const newSubtitleText = currentSubtitle ? currentSubtitle.contentLines.join('<br>') : '';
        if (subtitlesDiv.innerHTML !== newSubtitleText) {
            subtitlesDiv.innerHTML = newSubtitleText;
            makeWordsSelectable();
        }
        currentSentence = currentSubtitle ? currentSubtitle.contentLines.join(' ') : '';
        const plainText = currentSubtitle ? stripHTML(currentSubtitle.contentLines.join('\n')) : '';
        if (subtitleDisplay.value !== plainText) {
            subtitleDisplay.value = plainText;
        }
    }, debounceDelay);
    function makeWordsSelectable() {
        const subtitleText = subtitlesDiv.innerHTML;
        if (subtitleText) {
            subtitlesDiv.innerHTML = subtitleText.split('<br>').map(line =>
                line.split(' ').map(word => `<span class="subtitle">${word}</span>`).join(' ')
            ).join('<br>');
        }
    }
    function stripHTML(text) {
        const div = document.createElement('div');
        div.innerHTML = text;
        return div.textContent || div.innerText || '';
    }

    subtitleDisplay.addEventListener('keydown', (e) => {
        if (!e.ctrlKey && !e.metaKey && e.key.length === 1) {
            e.preventDefault();
        }
    });

    // =================================================================
    // XỬ LÝ SỰ KIỆN
    // =================================================================
    function hideOverlayIfReady() {
        if (isVideoLoaded && isSubtitlesLoaded) {
            inputOverlay.style.display = 'none';
            showError("Đã tải xong! Nhấn nút play để bắt đầu video với âm thanh.");
        }
    }
    videoUrlInput.addEventListener('change', () => {
        const url = videoUrlInput.value.trim();
        if (url) {
            try {
                video.src = url;
                video.load();
                isVideoLoaded = true;
                localStorage.setItem('videoUrl', url);
                localStorage.removeItem('videoFileName');
                hideOverlayIfReady();
            } catch (error) {
                showError(`Không thể tải video từ URL: ${error.message}`);
                isVideoLoaded = false;
            }
        }
    });
    videoUpload.addEventListener('change', (e) => {
        const videoFile = e.target.files[0];
        if (videoFile) {
            try {
                const fileUrl = URL.createObjectURL(videoFile);
                video.src = fileUrl;
                video.load();
                isVideoLoaded = true;
                localStorage.setItem('videoFileName', videoFile.name);
                localStorage.removeItem('videoUrl');
                hideOverlayIfReady();
            } catch (error) {
                showError(`Không thể tải file video: ${error.message}`);
                isVideoLoaded = false;
            }
        }
    });
    subtitleUpload.addEventListener('change', (e) => {
        const subtitleFile = e.target.files[0];
        if (!subtitleFile) return;
        if (!subtitleFile.name.toLowerCase().endsWith('.srt')) {
            showError('Vui lòng tải file .srt hợp lệ.');
            return;
        }
        const fileReader = new FileReader();
        fileReader.onload = (event) => {
            const subtitleText = event.target.result;
            subtitles = parseSRT(subtitleText);
            isSubtitlesLoaded = subtitles.length > 0;
            if (isSubtitlesLoaded) {
                localStorage.setItem('subtitleContent', subtitleText);
                subtitlesDiv.innerHTML = '';
                subtitleDisplay.value = '';
                hideOverlayIfReady();
            }
        };
        fileReader.onerror = () => showError('Không thể đọc file SRT.');
        fileReader.readAsText(subtitleFile, 'UTF-8');
    });
    rewindBtn.addEventListener('click', () => {
        const seconds = parseFloat(seekSecondsInput.value) || 5;
        video.currentTime = Math.max(0, video.currentTime - seconds);
    });
    forwardBtn.addEventListener('click', () => {
        const seconds = parseFloat(seekSecondsInput.value) || 5;
        video.currentTime = Math.min(video.duration || Infinity, video.currentTime + seconds);
    });
    video.addEventListener('timeupdate', updateSubtitles);
    video.addEventListener('loadedmetadata', () => {
        loopEnd = video.duration;
        loopEndElement.textContent = formatTime(loopEnd);
        updateLoopMarkers();
    });

    fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            videoContainer.requestFullscreen().catch(err => {
                alert(`Lỗi khi vào chế độ toàn màn hình: ${err.message} (${err.name})`);
            });
        } else {
            document.exitFullscreen();
        }
    });
    document.addEventListener('fullscreenchange', () => {
        if (document.fullscreenElement) {
            fullscreenBtn.textContent = 'Thoát';
        } else {
            fullscreenBtn.textContent = 'Toàn màn hình';
        }
    });

    // =================================================================
    // CHỨC NĂNG LẶP ĐOẠN
    // =================================================================
    function updateLoopList() {
        loopListElement.innerHTML = "";
        loops.forEach((loop, index) => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${index + 1}. ${formatTime(loop.start)} → ${formatTime(loop.end)}</span> <span class="delete-loop" data-index="${index}">Xóa</span>`;
            li.addEventListener('click', (e) => {
                if (e.target.classList.contains('delete-loop')) {
                    loops.splice(index, 1);
                    updateLoopList();
                    return;
                }
                video.currentTime = loop.start;
                video.play();
                if (isLooping) {
                    loopStart = loop.start;
                    loopEnd = loop.end;
                    loopStartElement.textContent = formatTime(loopStart);
                    loopEndElement.textContent = formatTime(loopEnd);
                }
            });
            loopListElement.appendChild(li);
        });
        updateLoopMarkers();
        localStorage.setItem('loopList', JSON.stringify(loops));
    }
    function updateLoopMarkers() {
        loopMarkersElement.innerHTML = "";
        if (video.duration) {
            loops.forEach((loop, index) => {
                const marker = document.createElement('div');
                marker.className = 'loop-marker';
                marker.title = `Lặp ${index + 1}: ${formatTime(loop.start)} - ${formatTime(loop.end)}`;
                const positionPercent = (loop.start / video.duration) * 100;
                marker.style.left = `${positionPercent}%`;
                marker.addEventListener('click', () => {
                    video.currentTime = loop.start;
                });
                loopMarkersElement.appendChild(marker);
            });
        }
    }
    setLoopStartElement.addEventListener('click', () => {
        loopStart = video.currentTime;
        loopStartElement.textContent = formatTime(loopStart);
    });
    setLoopEndElement.addEventListener('click', () => {
        loopEnd = video.currentTime;
        loopEndElement.textContent = formatTime(loopEnd);
    });
    addLoopElement.addEventListener('click', () => {
        if (loopStart >= loopEnd || loopEnd > video.duration) {
            showError('Thời gian lặp không hợp lệ.');
            return;
        }
        loops.push({ start: loopStart, end: loopEnd });
        loops.sort((a, b) => a.start - b.start);
        updateLoopList();
    });
    toggleLoopElement.addEventListener('change', () => {
        isLooping = toggleLoopElement.checked;
        toggleLoopElement.nextElementSibling.querySelector('.toggle-text').textContent = isLooping ? 'BẬT' : 'TẮT';
        localStorage.setItem('loopEnabled', isLooping);
        if (isLooping && (loopStart === 0 && loopEnd === video.duration)) {
            if(loops.length > 0) {
                loopStart = loops[0].start;
                loopEnd = loops[0].end;
                loopStartElement.textContent = formatTime(loopStart);
                loopEndElement.textContent = formatTime(loopEnd);
            }
        }
    });
    video.addEventListener('timeupdate', () => {
        if (isLooping && video.currentTime >= loopEnd) {
            video.currentTime = loopStart;
            video.play();
        }
    });

    // =================================================================
    // CHỨC NĂNG DỊCH THUẬT VÀ POPUP
    // =================================================================
    subtitlesDiv.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        const subtitleTarget = e.target.closest('.subtitle');
        if (subtitleTarget) {
            e.preventDefault();
            video.pause();
            translateWord(subtitleTarget.textContent);
        }
    });

    // THAY ĐỔI: Cải thiện chức năng bôi đen trên mobile
    function handleSelectionAndTranslate() {
        // Đợi một chút để trình duyệt ổn định việc lựa chọn văn bản
        setTimeout(() => {
            const selectedText = subtitleDisplay.value.substring(subtitleDisplay.selectionStart, subtitleDisplay.selectionEnd).trim();
            // Chỉ dịch khi có nhiều hơn 1 ký tự được chọn
            if (selectedText.length > 1) {
                video.pause();
                translateWord(selectedText);
            }
        }, 100);
    }
    subtitleDisplay.addEventListener('mouseup', handleSelectionAndTranslate);
    subtitleDisplay.addEventListener('touchend', handleSelectionAndTranslate);

    function closePopup() {
        translationPopup.style.display = 'none';
    }
    closePopupBtn.addEventListener('click', closePopup);
    document.addEventListener('click', (e) => {
      if (!translationPopup.contains(e.target) && !e.target.classList.contains('subtitle') && e.target !== subtitleDisplay) {
        closePopup();
      }
    });
    let isDragging = false, offsetX, offsetY;
    function startDrag(e) {
        isDragging = true;
        translationPopup.style.transition = 'none';
        const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
        offsetX = clientX - translationPopup.offsetLeft;
        offsetY = clientY - translationPopup.offsetTop;
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('touchmove', onDrag, { passive: false });
        document.addEventListener('mouseup', endDrag);
        document.addEventListener('touchend', endDrag);
    }
    function onDrag(e) {
        if (isDragging) {
            e.preventDefault();
            const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
            const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
            let newLeft = clientX - offsetX;
            let newTop = clientY - offsetY;
            const container = document.body;
            newLeft = Math.max(0, Math.min(newLeft, container.clientWidth - translationPopup.offsetWidth));
            newTop = Math.max(0, Math.min(newTop, container.clientHeight - translationPopup.offsetHeight));
            translationPopup.style.left = `${newLeft}px`;
            translationPopup.style.top = `${newTop}px`;
        }
    }
    function endDrag() {
        isDragging = false;
        translationPopup.style.transition = '';
        document.removeEventListener('mousemove', onDrag);
        document.removeEventListener('touchmove', onDrag);
        document.removeEventListener('mouseup', endDrag);
        document.removeEventListener('touchend', endDrag);
        localStorage.setItem('popupPosition', JSON.stringify({ top: translationPopup.offsetTop, left: translationPopup.offsetLeft }));
    }
    translationPopup.addEventListener('mousedown', startDrag);
    translationPopup.addEventListener('touchstart', startDrag);
    function restorePopupPosition() {
        const savedPosition = localStorage.getItem('popupPosition');
        if (savedPosition) {
            const { top, left } = JSON.parse(savedPosition);
            translationPopup.style.top = `${top}px`;
            translationPopup.style.left = `${left}px`;
        } else {
            translationPopup.style.left = '50%';
            translationPopup.style.top = '50%';
            translationPopup.style.transform = 'translate(-50%, -50%)';
        }
    }
    async function translateWord(word) {
        popupContent.innerHTML = 'Đang dịch...';
        translationPopup.style.display = 'block';
        restorePopupPosition();

        if (encodedApiKeys.length === 0 || encodedApiKeys[0].startsWith('DÁN_KEY')) {
            popupContent.innerHTML = '<p>Chưa cung cấp API key đã mã hóa.</p>';
            return;
        }

        const cleanedWord = word.replace(/[^a-zA-Zä-üÄ-Ü\s\-\']/g, '').trim();
        const sentence = currentSentence || cleanedWord;
        const translationPrompt = `
        Yêu cầu:
        **Đầu tiên, loại bỏ các định dạng không thuộc ngôn ngữ của "${cleanedWord}" và "${sentence}" (loại bỏ thẻ HTML, ký tự đặc biệt không thuộc tiếng Đức).**
        **Tiếp theo, phân tích từ/cụm từ "${cleanedWord}" trong câu "${sentence}" và trả về bản dịch sang tiếng Việt.**

        Trả về duy nhất cấu trúc JSON theo mẫu sau:
          {
            "tugoc": "Từ gốc (Động từ: dạng nguyên thể, kèm tiền tố tách nếu có; Danh từ: dạng số ít kèm mạo từ; giữ nguyên nếu là cụm từ/câu)",
            "nghia": "<Loại từ>: <Nghĩa 1>, <Nghĩa 2>, ... (kết hợp loại từ và các nghĩa tiếng Việt, ưu tiên nhiều nghĩa nếu có)"
          }

        A. Xác định loại từ của "${cleanedWord}":
          1. Câu: Nếu "${cleanedWord}" có chủ ngữ, vị ngữ và dấu câu cuối (., !, ?), hoặc cấu trúc ngữ pháp đầy đủ.
            - tugoc: "${cleanedWord}" (giữ nguyên)
            - nghia: "Câu: <Nghĩa tiếng Việt của câu>"
          2. Cụm từ: Nếu "${cleanedWord}" có hai từ trở lên nhưng không phải câu hoàn chỉnh.
            - tugoc: "${cleanedWord}" (giữ nguyên)
            - nghia: "Cụm từ: <Nghĩa tiếng Việt chính xác>"
          3. Từ đơn: Nếu "${cleanedWord}" là một từ.
            - Động từ tách: Kiểm tra "${sentence}" để tìm tiền tố tách (ab|an|auf|aus|bei|da|ein|fest|her|hin|los|mit|nach|statt|teil|vor|weg|zu|zurück|zusammen) ở cuối câu hoặc trước liên từ (und/oder/aber). Chuyển về nguyên thể và ghép tiền tố (ví dụ: "mach" + "aus" → "ausmachen").
            - Động từ phản thân: Tìm "sich|mich|dich|eur|uns" (ví dụ: "sich ändern").
            - Động từ kèm giới từ: Xác định giới từ (ví dụ: "teilnehmen an").
            - Danh từ: Nếu viết hoa, thêm mạo từ (der|die|das, tham khảo duden.de).
            - Tính từ/Trạng từ/Đại từ/Giới từ/Liên từ/Thán từ: Dùng dạng gốc.
            - tugoc: Dạng đúng theo loại từ (ví dụ: "ausmachen", "der Tisch").
            - nghia: "<Loại từ>: <Nghĩa 1>, <Nghĩa 2>, ..."

        Lưu ý:
          - Xác định chính xác loại từ, không cắt xén "${cleanedWord}".
          - Chỉ đưa ra nghĩa riêng cho "${cleanedWord}", không bao gồm nghĩa của từ khác trong "${sentence}".
          - Ưu tiên ngữ cảnh "${sentence}".
          - Tham khảo dict.cc/leo.org/duden.de.
          - Trả về JSON thuần hợp lệ trong \`\`\`json\n...\n\`\`\`.
      `;

        async function tryTranslateWithKey(keyIndex) {
            const apiKey = decodeApiKey(encodedApiKeys[keyIndex], secretKey);
            if (!apiKey) {
                popupContent.innerHTML = `<p>Lỗi: Không thể giải mã API key.</p>`;
                return;
            }
            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: translationPrompt }] }] })
                });
                if (!response.ok) {
                    if (response.status === 429 && keyIndex < encodedApiKeys.length - 1) {
                        return tryTranslateWithKey(keyIndex + 1);
                    }
                    throw new Error(`Lỗi HTTP: ${response.status}`);
                }
                const data = await response.json();
                const content = data.candidates[0].content.parts[0].text;
                const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
                if (!jsonMatch) throw new Error('Phản hồi API không chứa JSON hợp lệ.');
                const jsonData = JSON.parse(jsonMatch[1]);
                if (!jsonData.tugoc || !jsonData.nghia) throw new Error('Dữ liệu JSON không đầy đủ.');
                popupContent.innerHTML = `
                    <p><strong>Từ gốc:</strong> ${jsonData.tugoc}</p>
                    <p><strong>Nghĩa:</strong> ${jsonData.nghia}</p>
                `;
            } catch (error) {
                if (keyIndex < encodedApiKeys.length - 1) {
                    return tryTranslateWithKey(keyIndex + 1);
                } else {
                    popupContent.innerHTML = `<p>Lỗi khi dịch: ${error.message}</p>`;
                }
            }
        }
        tryTranslateWithKey(currentApiKeyIndex);
    }
    toggleSubtitlesElement.addEventListener('change', () => {
        subtitleEnabled = toggleSubtitlesElement.checked;
        subtitlesDiv.style.display = subtitleEnabled ? 'block' : 'none';
        subtitleDisplay.style.display = subtitleEnabled ? 'block' : 'none';
        document.querySelector('.subtitle-box').style.display = subtitleEnabled ? 'block' : 'none';
        toggleSubtitlesElement.nextElementSibling.querySelector('.toggle-text').textContent = subtitleEnabled ? 'BẬT' : 'TẮT';
        localStorage.setItem('subtitleEnabled', subtitleEnabled);
    });
    clearDataElement.addEventListener('click', () => {
        if (confirm('Bạn có chắc muốn xóa tất cả dữ liệu video, phụ đề và các đoạn lặp đã lưu?')) {
            localStorage.clear();
            location.reload();
        }
    });
    function loadFromLocalStorage() {
        const videoUrl = localStorage.getItem('videoUrl');
        const videoFileName = localStorage.getItem('videoFileName');
        const srtContent = localStorage.getItem('subtitleContent');
        const loopList = localStorage.getItem('loopList');
        const loopEnabled = localStorage.getItem('loopEnabled');
        const subtitleEnabledStored = localStorage.getItem('subtitleEnabled');
        if (videoUrl) { video.src = videoUrl; isVideoLoaded = true; }
        else if (videoFileName) { showError(`Vui lòng tải lại file video: ${videoFileName}`); }
        if (srtContent) { subtitles = parseSRT(srtContent); isSubtitlesLoaded = subtitles.length > 0; }
        hideOverlayIfReady();
        if (loopList) { loops = JSON.parse(loopList); updateLoopList(); }
        isLooping = loopEnabled !== null ? JSON.parse(loopEnabled) : false;
        toggleLoopElement.checked = isLooping;
        toggleLoopElement.nextElementSibling.querySelector('.toggle-text').textContent = isLooping ? 'BẬT' : 'TẮT';
        subtitleEnabled = subtitleEnabledStored !== null ? JSON.parse(subtitleEnabledStored) : true;
        toggleSubtitlesElement.checked = subtitleEnabled;
        toggleSubtitlesElement.nextElementSibling.querySelector('.toggle-text').textContent = subtitleEnabled ? 'BẬT' : 'TẮT';
        subtitlesDiv.style.display = subtitleEnabled ? 'block' : 'none';
        subtitleDisplay.style.display = subtitleEnabled ? 'block' : 'none';
        document.querySelector('.subtitle-box').style.display = subtitleEnabled ? 'block' : 'none';
    }
    loadFromLocalStorage();
});