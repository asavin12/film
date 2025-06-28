document.addEventListener('DOMContentLoaded', () => {
    const video = document.getElementById('video-player');
    const inputOverlay = document.getElementById('input-overlay');
    const videoUrlInput = document.getElementById('video-url');
    const videoUpload = document.getElementById('video-upload');
    const subtitleUrlInput = document.getElementById('subtitle-url');
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

    let subtitles = [];
    let currentSentence = '';
    let isVideoLoaded = false;
    let isSubtitlesLoaded = false;
    let hasPlayed = false;
    let isLooping = false;
    let subtitleEnabled = true;
    let loopStart = 0;
    let loopEnd = 0;
    let loops = [];
    const debounceDelay = 100;

    const apiKeys = [
      'YOUR_GEMINI_API_KEY_1', // Thay bằng key Gemini API hợp lệ
      'YOUR_GEMINI_API_KEY_2', // Thay bằng key Gemini API hợp lệ
    ];
    let currentApiKeyIndex = 0;

    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        setTimeout(() => errorMessage.style.display = 'none', 5000);
    }

    function getGoogleDriveDirectLink(sharingUrl) {
        const regex = /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/;
        const match = sharingUrl.match(regex);
        if (match && match[1]) {
            return `https://drive.google.com/uc?id=${match[1]}`;
        }
        return sharingUrl; // Trả về url gốc nếu không khớp
    }

    function loadFromLocalStorage() {
        const videoUrl = localStorage.getItem('videoUrl');
        const videoFileName = localStorage.getItem('videoFileName');
        const srtContent = localStorage.getItem('subtitleContent');
        const loopList = localStorage.getItem('loopList');
        const loopEnabled = localStorage.getItem('loopEnabled');
        const subtitleEnabledStored = localStorage.getItem('subtitleEnabled');

        if (videoUrl) {
            loadVideoUrl(videoUrl);
        } else if (videoFileName) {
            showError(`Vui lòng tải lại file video: ${videoFileName}`);
            isVideoLoaded = false;
        }

        if (srtContent) {
            processSubtitleContent(srtContent);
        }

        if (loopList) {
            try {
                loops = JSON.parse(loopList);
                updateLoopList();
            } catch (error) {
                showError(`Không thể tải danh sách đoạn lặp: ${error.message}`);
            }
        }

        isLooping = loopEnabled !== null ? JSON.parse(loopEnabled) : false;
        toggleLoopElement.checked = isLooping;
        toggleLoopElement.nextElementSibling.querySelector('.toggle-text').textContent = isLooping ? 'BẬT' : 'TẮT';
        
        subtitleEnabled = subtitleEnabledStored !== null ? JSON.parse(subtitleEnabledStored) : true;
        toggleSubtitlesElement.checked = subtitleEnabled;
        toggleSubtitlesElement.nextElementSibling.querySelector('.toggle-text').textContent = subtitleEnabled ? 'BẬT' : 'TẮT';
        subtitlesDiv.style.display = subtitleEnabled ? 'block' : 'none';

        if (isSubtitlesLoaded && subtitleEnabled) {
            updateSubtitles();
        }
    }

    function parseSRT(data) {
        try {
            let normalizedData = data.replace(/\uFEFF/g, '').replace(/\r\n|\r|\n/g, '\n').trim();
            const blocks = normalizedData.split(/\n\n+/).filter(block => block.trim());
            if (!blocks.length) throw new Error('File SRT trống hoặc không chứa khối hợp lệ.');
            
            const parsedSubtitles = [];
            blocks.forEach((block, index) => {
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
                    if (isNaN(h) || isNaN(m) || isNaN(s)) throw new Error(`Định dạng thời gian không hợp lệ: ${t}`);
                    return h * 3600 + m * 60 + s;
                });
                
                if (start >= end) return;
                parsedSubtitles.push({ startTime: start, endTime: end, contentLines });
            });

            if (!parsedSubtitles.length) throw new Error('Không tìm thấy khối phụ đề hợp lệ nào trong file.');
            return parsedSubtitles;
        } catch (error) {
            showError(`Lỗi phân tích file SRT: ${error.message}`);
            return [];
        }
    }
    
    function processSubtitleContent(content) {
        subtitles = parseSRT(content);
        isSubtitlesLoaded = subtitles.length > 0;
        localStorage.setItem('subtitleContent', content);
        displaySubtitles();
        if (isSubtitlesLoaded) {
            tryPlayVideo();
        }
    }

    function updateLoopMarkers() {
        loopMarkersElement.innerHTML = '';
        if (!video.duration) return;
        loops.forEach((loop, index) => {
            const marker = document.createElement('div');
            marker.className = 'loop-marker';
            marker.textContent = index + 1;
            const positionPercent = (loop.start / video.duration) * 100;
            marker.style.left = `${positionPercent}%`;
            marker.addEventListener('click', () => {
                video.currentTime = loop.start;
                video.play();
                if (isLooping) {
                    loopStart = loop.start;
                    loopEnd = loop.end;
                    loopStartElement.textContent = formatTime(loopStart);
                    loopEndElement.textContent = formatTime(loopEnd);
                }
            });
            loopMarkersElement.appendChild(marker);
        });
    }

    function updateLoopList() {
        loopListElement.innerHTML = '';
        loops.forEach((loop, index) => {
            const li = document.createElement('li');
            li.innerHTML = `${formatTime(loop.start)} → ${formatTime(loop.end)} <span class="delete-loop" data-index="${index}">Xóa</span>`;
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

    function stripHTML(text) {
        const div = document.createElement('div');
        div.innerHTML = text;
        return div.textContent || div.innerText || '';
    }

    function updateSubtitles() {
        if (!subtitleEnabled) {
            subtitlesDiv.style.display = 'none';
            subtitleDisplay.value = '';
            return;
        }
        
        const isFullscreen = !!document.fullscreenElement;
        const videoRect = video.getBoundingClientRect();
        const videoHeight = videoRect.height;
        const windowHeight = window.innerHeight;
        const fontSizePx = isFullscreen ? windowHeight * 0.05 : videoHeight * 0.05;

        subtitlesDiv.style.fontSize = `${fontSizePx}px`;
        subtitlesDiv.style.display = 'block';

        const currentTime = video.currentTime;
        const currentSubtitle = subtitles.find(sub => sub.startTime <= currentTime && currentTime <= sub.endTime);
        
        subtitleDisplay.value = currentSubtitle ? stripHTML(currentSubtitle.contentLines.join('\n')) : '';

        const newSubtitleText = currentSubtitle ? currentSubtitle.contentLines.join('<br>') : '';
        if (subtitlesDiv.innerHTML !== newSubtitleText) {
            subtitlesDiv.innerHTML = newSubtitleText;
            makeWordsSelectable();
        }
    }

    function displaySubtitles() {
        subtitlesDiv.innerHTML = subtitles.length ? '' : 'Chưa tải phụ đề.';
        subtitleDisplay.value = subtitles.length ? '' : 'Chưa tải phụ đề.';
        errorMessage.style.display = 'none';
        updateSubtitles();
    }

    function tryPlayVideo() {
        if (isVideoLoaded && isSubtitlesLoaded && !hasPlayed) {
            inputOverlay.style.display = 'none';
            video.play().then(() => {
                hasPlayed = true;
            }).catch(e => {
                showError(`Video cần tương tác của người dùng để phát.`);
                inputOverlay.style.display = 'flex';
            });
        }
    }
    
    function loadVideoUrl(url) {
        try {
            const directUrl = getGoogleDriveDirectLink(url);
            video.src = directUrl;
            video.load();
            isVideoLoaded = true;
            localStorage.setItem('videoUrl', url);
            localStorage.removeItem('videoFileName');
            errorMessage.style.display = 'none';
            video.addEventListener('loadedmetadata', tryPlayVideo, { once: true });
        } catch (error) {
            showError(`Không thể tải video từ URL: ${error.message}`);
            isVideoLoaded = false;
            localStorage.removeItem('videoUrl');
        }
    }
    
    videoUrlInput.addEventListener('change', () => {
        const url = videoUrlInput.value.trim();
        if (url) {
            loadVideoUrl(url);
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
                errorMessage.style.display = 'none';
                video.addEventListener('loadedmetadata', tryPlayVideo, { once: true });
            } catch (error) {
                showError(`Không thể tải file video: ${error.message}`);
                isVideoLoaded = false;
                localStorage.removeItem('videoFileName');
            }
        }
    });

    async function loadSubtitleFromUrl(url) {
        try {
            const directUrl = getGoogleDriveDirectLink(url).replace("uc?id=", "uc?export=download&id=");
            const response = await fetch(directUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const srtContent = await response.text();
            processSubtitleContent(srtContent);
        } catch (error) {
            showError(`Không thể tải phụ đề từ URL: ${error.message}`);
            isSubtitlesLoaded = false;
        }
    }

    subtitleUrlInput.addEventListener('change', () => {
        const url = subtitleUrlInput.value.trim();
        if (url) {
            loadSubtitleFromUrl(url);
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
            processSubtitleContent(event.target.result);
        };
        fileReader.onerror = () => {
            showError('Không thể đọc file SRT.');
        };
        fileReader.readAsText(subtitleFile, 'UTF-8');
    });

    subtitlesDiv.addEventListener('mousedown', (e) => {
        const subtitleTarget = e.target.closest('.subtitle');
        if (!subtitleTarget) return;
        video.pause();
        translateWord(subtitleTarget.textContent, subtitleTarget);
    });

    subtitleDisplay.addEventListener('mouseup', () => {
        const selectedText = subtitleDisplay.value.substring(subtitleDisplay.selectionStart, subtitleDisplay.selectionEnd).trim();
        if (selectedText) {
            video.pause();
            translateWord(selectedText, subtitleDisplay);
        }
    });
    
    const debouncedTimeUpdate = debounce(() => {
        if (video.paused) return;
        handleLooping();
        updateSubtitles();
    }, debounceDelay);

    video.addEventListener('timeupdate', debouncedTimeUpdate);

    function makeWordsSelectable() {
        const subtitleText = subtitlesDiv.innerHTML;
        if (subtitleText) {
            const subtitleLines = subtitleText.split('<br>').map(line => 
                line.split(' ').map(word => `<span class="subtitle">${word}</span>`).join(' ')
            );
            subtitlesDiv.innerHTML = subtitleLines.join('<br>');
        }
    }

    function handleLooping() {
        if (isLooping && loopEnd > loopStart && video.currentTime >= loopEnd) {
            video.currentTime = loopStart;
            video.play();
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
        if (loopStart >= loopEnd || loopStart < 0 || loopEnd > video.duration) {
            showError('Thời gian lặp không hợp lệ.');
            return;
        }
        loops.push({ start: loopStart, end: loopEnd });
        updateLoopList();
        loopStart = 0;
        loopEnd = video.duration || 0;
        loopStartElement.textContent = '00:00';
        loopEndElement.textContent = formatTime(loopEnd);
    });

    toggleLoopElement.addEventListener('change', () => {
        isLooping = toggleLoopElement.checked;
        toggleLoopElement.nextElementSibling.querySelector('.toggle-text').textContent = isLooping ? 'BẬT' : 'TẮT';
        localStorage.setItem('loopEnabled', isLooping);
        if (!isLooping) {
            loopStart = 0;
            loopEnd = video.duration || 0;
        }
    });

    toggleSubtitlesElement.addEventListener('change', () => {
        subtitleEnabled = toggleSubtitlesElement.checked;
        subtitlesDiv.style.display = subtitleEnabled ? 'block' : 'none';
        toggleSubtitlesElement.nextElementSibling.querySelector('.toggle-text').textContent = subtitleEnabled ? 'BẬT' : 'TẮT';
        localStorage.setItem('subtitleEnabled', subtitleEnabled);
        if (subtitleEnabled) updateSubtitles();
    });

    clearDataElement.addEventListener('click', () => {
        localStorage.clear();
        location.reload();
    });
    
    rewindBtn.addEventListener('click', () => {
        const seconds = parseFloat(seekSecondsInput.value) || 5;
        video.currentTime = Math.max(0, video.currentTime - seconds);
    });

    forwardBtn.addEventListener('click', () => {
        const seconds = parseFloat(seekSecondsInput.value) || 5;
        video.currentTime = Math.min(video.duration || Infinity, video.currentTime + seconds);
    });

    seekSecondsInput.addEventListener('input', () => {
        let value = parseInt(seekSecondsInput.value, 10);
        if (isNaN(value) || value < 1) seekSecondsInput.value = 1;
        if (value > 60) seekSecondsInput.value = 60;
    });

    window.addEventListener('resize', updateSubtitles);
    video.addEventListener('loadedmetadata', () => {
        updateSubtitles();
        updateLoopMarkers();
        loopEnd = video.duration;
        loopEndElement.textContent = formatTime(loopEnd);
    });
    video.addEventListener('play', updateSubtitles);

    // Translation Popup Logic
    let isDragging = false, currentX, currentY, initialX, initialY;

    function closePopup() {
        translationPopup.style.display = 'none';
    }
    
    window.closePopup = closePopup; // Make it accessible from HTML onclick

    translationPopup.addEventListener('mousedown', (e) => {
        initialX = e.clientX - (currentX || 0);
        initialY = e.clientY - (currentY || 0);
        if (e.target.classList.contains('close-btn')) return;
        isDragging = true;
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            translationPopup.style.left = `${currentX}px`;
            translationPopup.style.top = `${currentY}px`;
        }
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        if (currentX !== undefined) {
             localStorage.setItem('popupPosition', JSON.stringify({ top: currentY, left: currentX }));
        }
    });

    function restorePopupPosition() {
        const savedPosition = localStorage.getItem('popupPosition');
        if (savedPosition) {
            const { top, left } = JSON.parse(savedPosition);
            translationPopup.style.top = `${top}px`;
            translationPopup.style.left = `${left}px`;
            currentX = left;
            currentY = top;
        } else {
            // Center popup initially
            translationPopup.style.left = '50%';
            translationPopup.style.top = '20%';
            translationPopup.style.transform = 'translateX(-50%)';
        }
    }
    
    function debounce(func, delay) {
      let timeoutId;
      return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func(...args), delay);
      };
    }
    
    async function translateWord(word, targetElement) {
      // Logic for translation remains the same.
      // Make sure to replace YOUR_GEMINI_API_KEY with your actual keys.
      popupContent.innerHTML = 'Đang dịch...';
      translationPopup.style.display = 'block';
      restorePopupPosition();

      const cleanedWord = word.replace(/[^a-zA-Zä-üÄ-Ü\s\-\']/g, '').trim();
      const sentence = currentSentence || cleanedWord;

      // The prompt is complex and specific, keeping it as is.
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
        const apiKey = apiKeys[keyIndex];
        if (!apiKey || apiKey.startsWith('YOUR_')) {
             popupContent.innerHTML = `<p>Chưa cấu hình Gemini API key.</p>`;
             return;
        }

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: translationPrompt }] }] })
            });

            if (!response.ok) {
                if (response.status === 429 && keyIndex < apiKeys.length - 1) {
                    return tryTranslateWithKey(keyIndex + 1);
                }
                throw new Error(`Lỗi HTTP: ${response.status}`);
            }

            const data = await response.json();
            const content = data.candidates[0].content.parts[0].text;
            const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
            if (!jsonMatch) throw new Error('API không trả về JSON hợp lệ.');

            const jsonData = JSON.parse(jsonMatch[1]);
            if (!jsonData.tugoc || !jsonData.nghia) throw new Error('JSON thiếu thuộc tính "tugoc" hoặc "nghia".');

            popupContent.innerHTML = `<p><strong>Từ gốc:</strong> ${jsonData.tugoc}</p><p><strong>Nghĩa:</strong> ${jsonData.nghia}</p>`;
        } catch (error) {
            if (keyIndex < apiKeys.length - 1) {
                return tryTranslateWithKey(keyIndex + 1);
            } else {
                popupContent.innerHTML = `<p>Lỗi khi dịch: ${error.message}</p>`;
            }
        }
      }

      tryTranslateWithKey(currentApiKeyIndex);
    }
    
    loadFromLocalStorage();
});