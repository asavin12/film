document.addEventListener('DOMContentLoaded', () => {
    // --- Lấy các phần tử giao diện ---
    const galleryView = document.getElementById('video-gallery');
    const playerView = document.getElementById('player-view');
    const backToGalleryBtn = document.getElementById('back-to-gallery-btn');
    
    // --- Lấy các phần tử của trình phát ---
    const videoContainer = document.getElementById('video-container');
    const video = document.getElementById('video-player');
    const subtitlesDiv = document.getElementById('subtitles');
    const subtitleDisplay = document.getElementById('subtitle-display');
    const translationPopup = document.getElementById('translation-popup');
    const popupContent = document.getElementById('popup-content');
    const errorMessage = document.getElementById('error-message');
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    const translateTextareaBtn = document.getElementById('translate-textarea-btn');
    const closePopupBtn = document.querySelector('#translation-popup .close-btn');
    // ... và các phần tử điều khiển khác
    const setLoopStartElement=document.getElementById("set-loop-start"),setLoopEndElement=document.getElementById("set-loop-end"),loopStartElement=document.getElementById("loop-start-display"),loopEndElement=document.getElementById("loop-end-display"),addLoopElement=document.getElementById("add-loop"),toggleLoopElement=document.getElementById("toggle-loop"),toggleSubtitlesElement=document.getElementById("toggle-subtitles"),loopListElement=document.getElementById("loop-list"),loopMarkersElement=document.getElementById("loop-markers"),rewindBtn=document.getElementById("rewind-btn"),forwardBtn=document.getElementById("forward-btn"),seekSecondsInput=document.getElementById("seek-seconds");

    // --- Biến trạng thái ---
    let subtitles = [];
    let currentSentence = '';
    let loops = [];
    let isLooping = false;
    let subtitleEnabled = true;
    let videoData = []; // Lưu danh sách video từ JSON

    // --- TÍCH HỢP GIẢI MÃ API KEY ---
    const secretKey = 'mysecretkey';
    const encodedApiKeys = ['LDAJBDALJhg/F0AsISQjUiEXBS8gEDtPPFAhBVQ1Rj0qBD08XCQj','LDAJBDALJEQBLAkVPQsBKRoJPSU3TwNKAgYIOVcHLV0xVSoEKCkZ','LDAJBDALIQAFPwFZKjc8EkZRLg1TSDQ2ORUEBh0uP10cIg4bClo7'];
    let currentApiKeyIndex = 0;
    function decodeApiKey(e,t){try{const o=atob(e);return Array.from(o).map(((e,o)=>String.fromCharCode(e.charCodeAt(0)^t.charCodeAt(o%t.length)))).join("")}catch(e){return console.error("Lỗi giải mã API key.",e),""}}

    // =================================================================
    // KHỞI TẠO ỨNG DỤNG
    // =================================================================

    // Hàm chính để tải và hiển thị danh sách video
    async function initializeGallery() {
        try {
            const response = await fetch('videos.json');
            if (!response.ok) {
                throw new Error(`Không thể tải videos.json: ${response.statusText}`);
            }
            videoData = await response.json();
            
            galleryView.innerHTML = ''; // Xóa nội dung cũ
            videoData.forEach(videoInfo => {
                const videoItem = document.createElement('div');
                videoItem.className = 'video-list-item';
                videoItem.dataset.videoId = videoInfo.id; // Lưu id để tham chiếu
                
                videoItem.innerHTML = `
                    <img src="${videoInfo.thumbnailUrl}" alt="${videoInfo.title}">
                    <h3 class="title">${videoInfo.title}</h3>
                `;
                
                videoItem.addEventListener('click', () => {
                    const selectedVideo = videoData.find(v => v.id === videoInfo.id);
                    if (selectedVideo) {
                        // Chuyển giao diện
                        galleryView.classList.add('hidden');
                        playerView.classList.remove('hidden');
                        // Tải video và phụ đề
                        loadPlayer(selectedVideo.videoUrl, selectedVideo.subtitleUrl);
                    }
                });
                
                galleryView.appendChild(videoItem);
            });

        } catch (error) {
            galleryView.innerHTML = `<p class="text-red-500 text-center">${error.message}</p>`;
            console.error(error);
        }
    }

    // Hàm để tải video và phụ đề vào trình phát
    async function loadPlayer(videoUrl, subtitleUrl) {
        try {
            // Reset trạng thái cũ
            video.pause();
            video.src = '';
            subtitles = [];
            subtitleDisplay.value = '';
            subtitlesDiv.innerHTML = '';
            
            // Tải video mới
            video.src = videoUrl;
            video.load();
            
            // Tải phụ đề mới từ URL
            const subResponse = await fetch(subtitleUrl);
            if (!subResponse.ok) {
                throw new Error('Không thể tải file phụ đề.');
            }
            const srtContent = await subResponse.text();
            subtitles = parseSRT(srtContent);
            
            showError("Đã tải video và phụ đề. Nhấn Play để bắt đầu!");
            
        } catch (error) {
            showError(`Lỗi khi tải dữ liệu: ${error.message}`);
            console.error(error);
        }
    }

    // Sự kiện cho nút "Quay lại danh sách"
    backToGalleryBtn.addEventListener('click', () => {
        video.pause();
        video.src = ''; // Dừng tải video
        galleryView.classList.remove('hidden');
        playerView.classList.add('hidden');
    });

    // Bắt đầu chạy ứng dụng bằng cách tải thư viện
    initializeGallery();


    // =================================================================
    // LOGIC CỦA TRÌNH PHÁT (Phần lớn giữ nguyên, chỉ sửa đổi nhỏ)
    // =================================================================
    
    // Các hàm tiện ích
    function debounce(func,delay){let t;return(...e)=>{clearTimeout(t),t=setTimeout((()=>func(...e)),delay)}}
    function formatTime(e){if(isNaN(e))return"00:00";const t=Math.floor(e/60),o=Math.floor(e%60);return`${t.toString().padStart(2,"0")}:${o.toString().padStart(2,"0")}`}
    function showError(e){errorMessage.textContent=e,errorMessage.style.display="block",setTimeout((()=>{errorMessage.style.display="none"}),4e3)}
    function parseSRT(e){try{let t=e.replace(/\uFEFF/g,"").replace(/\r\n|\r|\n/g,"\n").trim().split(/\n\n+/).filter((e=>e.trim()));if(!t.length)throw new Error("File SRT trống hoặc không chứa khối hợp lệ.");const o=[];return t.forEach((e=>{const t=e.split("\n").filter((e=>e.trim()));if(t.length<2)return;let r=t.findIndex((e=>e.includes(" --> ")));if(-1===r)return;const n=t[r],i=t.slice(r+1).filter((e=>e.trim()));if(!i.length)return;const[s,a]=n.split(" --> ").map((e=>{const t=e.replace(",",".").trim().split(":"),o=parseInt(t[0],10),r=parseInt(t[1],10),n=parseFloat(t[2]);return isNaN(o)||isNaN(r)||isNaN(n)?NaN:3600*o+60*r+n}));(isNaN(s)||isNaN(a)||s>=a)||o.push({startTime:s,endTime:a,contentLines:i})})),o.length?o:void 0}catch(e){return showError(`Lỗi phân tích file SRT: ${e.message}`),[]}}
    const updateSubtitles=debounce((()=>{if(subtitleEnabled&&subtitles.length>0&&!video.paused){const e=video.currentTime,t=subtitles.find((t=>t.startTime<=e&&e<=t.endTime)),o=t?t.contentLines.join("<br>"):"";subtitlesDiv.innerHTML!==o&&(subtitlesDiv.innerHTML=o,makeWordsSelectable()),currentSentence=t?t.contentLines.join(" "):"";const r=t?stripHTML(t.contentLines.join("\n")):"";subtitleDisplay.value!==r&&(subtitleDisplay.value=r)}}),100);
    function makeWordsSelectable(){const e=subtitlesDiv.innerHTML;e&&(subtitlesDiv.innerHTML=e.split("<br>").map((e=>e.split(" ").map((e=>`<span class="subtitle">${e}</span>`)).join(" "))).join("<br>"))}
    function stripHTML(e){const t=document.createElement("div");return t.innerHTML=e,t.textContent||t.innerText||""}
    subtitleDisplay.addEventListener("keydown",(e=>{e.ctrlKey||e.metaKey||1!==e.key.length||e.preventDefault()}));

    // Các sự kiện của trình phát
    rewindBtn.addEventListener("click",(()=>{const e=parseFloat(seekSecondsInput.value)||5;video.currentTime=Math.max(0,video.currentTime-e)})),forwardBtn.addEventListener("click",(()=>{const e=parseFloat(seekSecondsInput.value)||5;video.currentTime=Math.min(video.duration||1/0,video.currentTime+e)})),video.addEventListener("timeupdate",updateSubtitles),video.addEventListener("loadedmetadata",(()=>{loopEndElement.textContent=formatTime(video.duration),updateLoopMarkers()}));
    fullscreenBtn.addEventListener("click",(()=>{document.fullscreenElement?document.exitFullscreen():videoContainer.requestFullscreen().catch((e=>{alert(`Lỗi khi vào chế độ toàn màn hình: ${e.message} (${e.name})`)}))})),document.addEventListener("fullscreenchange",(()=>{fullscreenBtn.textContent=document.fullscreenElement?"Thoát":"Toàn màn hình"}));
    function updateLoopList(){loopListElement.innerHTML="",loops.forEach(((e,t)=>{const o=document.createElement("li");o.innerHTML=`<span>${t+1}. ${formatTime(e.start)} → ${formatTime(e.end)}</span> <span class="delete-loop" data-index="${t}">Xóa</span>`,o.addEventListener("click",(t=>{if(t.target.classList.contains("delete-loop"))return loops.splice(t,1),void updateLoopList();video.currentTime=e.start,video.play(),isLooping&&(loopStart=e.start,loopEnd=e.end,loopStartElement.textContent=formatTime(loopStart),loopEndElement.textContent=formatTime(loopEnd))})),loopListElement.appendChild(o)})),updateLoopMarkers(),localStorage.setItem("loopList",JSON.stringify(loops))}function updateLoopMarkers(){loopMarkersElement.innerHTML="",video.duration&&loops.forEach(((e,t)=>{const o=document.createElement("div");o.className="loop-marker",o.title=`Lặp ${t+1}: ${formatTime(e.start)} - ${formatTime(e.end)}`;const r=e.start/video.duration*100;o.style.left=`${r}%`,o.addEventListener("click",(()=>{video.currentTime=e.start})),loopMarkersElement.appendChild(o)}))}setLoopStartElement.addEventListener("click",(()=>{loopStart=video.currentTime,loopStartElement.textContent=formatTime(loopStart)})),setLoopEndElement.addEventListener("click",(()=>{loopEnd=video.currentTime,loopEndElement.textContent=formatTime(loopEnd)})),addLoopElement.addEventListener("click",(()=>{loopStart>=loopEnd||loopEnd>video.duration?showError("Thời gian lặp không hợp lệ."):(loops.push({start:loopStart,end:loopEnd}),loops.sort(((e,t)=>e.start-t.start)),updateLoopList())})),toggleLoopElement.addEventListener("change",(()=>{isLooping=toggleLoopElement.checked,toggleLoopElement.nextElementSibling.querySelector(".toggle-text").textContent=isLooping?"BẬT":"TẮT",localStorage.setItem("loopEnabled",isLooping),isLooping&&0===loopStart&&loopEnd===video.duration&&loops.length>0&&(loopStart=loops[0].start,loopEnd=loops[0].end,loopStartElement.textContent=formatTime(loopStart),loopEndElement.textContent=formatTime(loopEnd))})),video.addEventListener("timeupdate",(()=>{isLooping&&video.currentTime>=loopEnd&&(video.currentTime=loopStart,video.play())}));
    subtitlesDiv.addEventListener("mousedown",(e=>{if(0!==e.button)return;const t=e.target.closest(".subtitle");t&&(e.preventDefault(),video.pause(),translateWord(t.textContent))}));function handleSelectionAndTranslate(){setTimeout((()=>{const e=subtitleDisplay.value.substring(subtitleDisplay.selectionStart,subtitleDisplay.selectionEnd).trim();e.length>1&&(video.pause(),translateWord(e))}),100)}subtitleDisplay.addEventListener("mouseup",handleSelectionAndTranslate),subtitleDisplay.addEventListener("touchend",handleSelectionAndTranslate),translateTextareaBtn.addEventListener("click",(()=>{subtitleDisplay.value.trim()&&(subtitleDisplay.select(),handleSelectionAndTranslate())}));
    function closePopup(){translationPopup.style.display="none"}closePopupBtn.addEventListener("click",closePopup),document.addEventListener("click",(e=>{translationPopup.contains(e.target)||e.target.classList.contains("subtitle")||e.target===subtitleDisplay||closePopup()}));let isDragging=!1,offsetX,offsetY;function startDrag(e){isDragging=!0,translationPopup.style.transition="none";const t="touchstart"===e.type?e.touches[0].clientX:e.clientX,o="touchstart"===e.type?e.touches[0].clientY:e.clientY;offsetX=t-translationPopup.offsetLeft,offsetY=o-translationPopup.offsetTop,document.addEventListener("mousemove",onDrag),document.addEventListener("touchmove",onDrag,{passive:!1}),document.addEventListener("mouseup",endDrag),document.addEventListener("touchend",endDrag)}function onDrag(e){if(isDragging){e.preventDefault();const t="touchmove"===e.type?e.touches[0].clientX:e.clientX,o="touchmove"===e.type?e.touches[0].clientY:e.clientY;let r=t-offsetX,n=o-offsetY;const i=document.body;r=Math.max(0,Math.min(r,i.clientWidth-translationPopup.offsetWidth)),n=Math.max(0,Math.min(n,i.clientHeight-translationPopup.offsetHeight)),translationPopup.style.left=`${r}px`,translationPopup.style.top=`${n}px`}}function endDrag(){isDragging=!1,translationPopup.style.transition="",document.removeEventListener("mousemove",onDrag),document.removeEventListener("touchmove",onDrag),document.removeEventListener("mouseup",endDrag),document.removeEventListener("touchend",endDrag)}translationPopup.addEventListener("mousedown",startDrag),translationPopup.addEventListener("touchstart",startDrag);
    function restorePopupPosition(){const e=localStorage.getItem("popupPosition");e?(({top:e,left:t}=JSON.parse(e)),translationPopup.style.top=`${e}px`,translationPopup.style.left=`${t}px`):(translationPopup.style.left="50%",translationPopup.style.top="50%",translationPopup.style.transform="translate(-50%, -50%)")}async function translateWord(e){if(popupContent.innerHTML="Đang dịch...",translationPopup.style.display="block",restorePopupPosition(),0===encodedApiKeys.length||encodedApiKeys[0].startsWith("DÁN_KEY"))return void(popupContent.innerHTML="<p>Chưa cung cấp API key đã mã hóa.</p>");const t=e.replace(/[^a-zA-Zä-üÄ-Ü\s\-\']/g,"").trim(),o=currentSentence||t,r=`\n        Yêu cầu:\n        **Đầu tiên, loại bỏ các định dạng không thuộc ngôn ngữ của "${t}" và "${o}" (loại bỏ thẻ HTML, ký tự đặc biệt không thuộc tiếng Đức).**\n        **Tiếp theo, phân tích từ/cụm từ "${t}" trong câu "${o}" và trả về bản dịch sang tiếng Việt.**\n\n        Trả về duy nhất cấu trúc JSON theo mẫu sau:\n          {\n            "tugoc": "Từ gốc (Động từ: dạng nguyên thể, kèm tiền tố tách nếu có; Danh từ: dạng số ít kèm mạo từ; giữ nguyên nếu là cụm từ/câu)",\n            "nghia": "<Loại từ>: <Nghĩa 1>, <Nghĩa 2>, ... (kết hợp loại từ và các nghĩa tiếng Việt, ưu tiên nhiều nghĩa nếu có)"\n          }\n\n        A. Xác định loại từ của "${t}":\n          1. Câu: Nếu "${t}" có chủ ngữ, vị ngữ và dấu câu cuối (., !, ?), hoặc cấu trúc ngữ pháp đầy đủ.\n            - tugoc: "${t}" (giữ nguyên)\n            - nghia: "Câu: <Nghĩa tiếng Việt của câu>"\n          2. Cụm từ: Nếu "${t}" có hai từ trở lên nhưng không phải câu hoàn chỉnh.\n            - tugoc: "${t}" (giữ nguyên)\n            - nghia: "Cụm từ: <Nghĩa tiếng Việt chính xác>"\n          3. Từ đơn: Nếu "${t}" là một từ.\n            - Động từ tách: Kiểm tra "${o}" để tìm tiền tố tách (ab|an|auf|aus|bei|da|ein|fest|her|hin|los|mit|nach|statt|teil|vor|weg|zu|zurück|zusammen) ở cuối câu hoặc trước liên từ (und/oder/aber). Chuyển về nguyên thể và ghép tiền tố (ví dụ: "mach" + "aus" → "ausmachen").\n            - Động từ phản thân: Tìm "sich|mich|dich|eur|uns" (ví dụ: "sich ändern").\n            - Động từ kèm giới từ: Xác định giới từ (ví dụ: "teilnehmen an").\n            - Danh từ: Nếu viết hoa, thêm mạo từ (der|die|das, tham khảo duden.de).\n            - Tính từ/Trạng từ/Đại từ/Giới từ/Liên từ/Thán từ: Dùng dạng gốc.\n            - tugoc: Dạng đúng theo loại từ (ví dụ: "ausmachen", "der Tisch").\n            - nghia: "<Loại từ>: <Nghĩa 1>, <Nghĩa 2>, ..."\n\n        Lưu ý:\n          - Xác định chính xác loại từ, không cắt xén "${t}".\n          - Chỉ đưa ra nghĩa riêng cho "${t}", không bao gồm nghĩa của từ khác trong "${o}".\n          - Ưu tiên ngữ cảnh "${o}".\n          - Tham khảo dict.cc/leo.org/duden.de.\n          - Trả về JSON thuần hợp lệ trong \`\`\`json\n...\n\`\`\`.\n      `;!function e(t){const o=decodeApiKey(encodedApiKeys[t],secretKey);o?fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${o}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:r}]}]})}).then((o=>{if(!o.ok){if(429===o.status&&t<encodedApiKeys.length-1)return e(t+1);throw new Error(`Lỗi HTTP: ${o.status}`)}return o.json()})).then((e=>{const t=e.candidates[0].content.parts[0].text,o=t.match(/```json\n([\s\S]*?)\n```/);if(!o)throw new Error("Phản hồi API không chứa JSON hợp lệ.");const r=JSON.parse(o[1]);if(!r.tugoc||!r.nghia)throw new Error("Dữ liệu JSON không đầy đủ.");popupContent.innerHTML=`\n                    <p><strong>Từ gốc:</strong> ${r.tugoc}</p>\n                    <p><strong>Nghĩa:</strong> ${r.nghia}</p>\n                `})).catch((o=>{t<encodedApiKeys.length-1?e(t+1):popupContent.innerHTML=`<p>Lỗi khi dịch: ${o.message}</p>`})):popupContent.innerHTML="<p>Lỗi: Không thể giải mã API key.</p>"}(currentApiKeyIndex)}
    toggleSubtitlesElement.addEventListener("change",(()=>{subtitleEnabled=toggleSubtitlesElement.checked,subtitlesDiv.style.display=subtitleEnabled?"block":"none",subtitleDisplay.style.display=subtitleEnabled?"block":"none",document.querySelector(".subtitle-box").style.display=subtitleEnabled?"block":"none",toggleSubtitlesElement.nextElementSibling.querySelector(".toggle-text").textContent=subtitleEnabled?"BẬT":"TẮT",localStorage.setItem("subtitleEnabled",subtitleEnabled)}));
});