# Signature Verification App

A full-stack signature authenticity verification system. The backend uses a Siamese Neural Network (PyTorch + FastAPI) trained on the MCYT-100 dataset. The frontend is a React Native / Expo app that runs on iOS, Android, and web.

## Project Structure

```
Project/
├── signature_verification_backend-main (1)/
│   └── signature_verification_backend-main/   # Python backend
│       ├── main.py          # FastAPI server & inference endpoints
│       ├── network.py       # SiameseNetwork + FeatureExtractor model definition
│       ├── dataset.py       # MCYT-100 dataset loader & pair generation
│       ├── train.py         # Training, evaluation, and CLI predict
│       ├── research_analytics.py
│       ├── requirements.txt
│       ├── best_model.pth   # Best checkpoint (saved during training)
│       ├── model_last.pth   # Last epoch checkpoint
│       └── MCYT 100/        # Dataset root (not committed)
│           ├── MCYT_Signature_100originalConvertedGenuine/<person_id>/*.jpg
│           └── MCYT_Signature_100originalConvertedForged/<person_id>/*.jpg
└── signature_verification_react_native_app-master/
    └── signature_verification_react_native_app-master/  # Expo frontend
        ├── App.js                    # Entry point (delegates to SignatureVerificationApp)
        ├── SignatureVerificationApp.js  # Main UI component
        ├── index.js
        ├── app.json
        ├── eas.json
        └── package.json
```

## Backend

### Stack
- **Python 3.13**, FastAPI, Uvicorn
- **PyTorch >= 2.0**, torchvision
- Pillow, scikit-learn, pandas, tqdm, matplotlib

### Model Architecture (`network.py`)
- `FeatureExtractor`: 3-layer CNN (32→64→128 channels, BatchNorm, LeakyReLU, MaxPool) → 128-dim embedding
- `SiameseNetwork`: two weight-sharing `FeatureExtractor` branches → L2-normalize embeddings → L1 distance → FC classifier (128→64→1)
- Output: single logit; `sigmoid(logit) >= 0.5` → **Genuine**, `< 0.5` → **Forged**
- Label convention: **1 = genuine, 0 = forged** (must be consistent across `dataset.py`, `train.py`, `main.py`)

### Image Transform (must match training exactly)
```python
transforms.Compose([
    transforms.Grayscale(),
    transforms.Resize((64, 64)),
    transforms.ToTensor(),
])
```
Changing this transform in `main.py` without retraining will silently break inference.

### API Endpoints (`main.py`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Service info & endpoint listing |
| GET | `/health` | Model load status |
| POST | `/verify-base64` | Verify from `{"image1": "<base64>", "image2": "<base64>"}` |
| POST | `/verify-files` | Verify from multipart file upload (png/jpg/jpeg/bmp) |
| POST | `/batch-verify` | Verify up to 10 pairs: `{"pairs": [{"image1": ..., "image2": ...}]}` |
| GET | `/docs` | Auto-generated Swagger UI |

Response shape (single pair):
```json
{
  "is_genuine": true,
  "result": "Genuine",
  "genuine_score": 0.8731,
  "confidence": 0.7462,
  "threshold": 0.5,
  "processing_time_ms": 12.5
}
```

### Running the Backend
```bash
cd "signature_verification_backend-main (1)/signature_verification_backend-main"
pip install -r requirements.txt
python main.py          # starts on http://0.0.0.0:8000
```

### Training
```bash
python train.py train          # train and save best_model.pth
python train.py val            # evaluate on test split with plots
python train.py test img1.jpg img2.jpg   # quick CLI predict
```

Training config in `train.py`:
- Epochs: 50 (early stopping patience = 7)
- LR: 5e-5, Adam, ReduceLROnPlateau (patience=3, factor=0.5)
- Batch size: 16; 100 genuine + 100 forged pairs per person
- Split: 70% train / 10% val / 20% test

## Frontend

### Stack
- **React Native 0.73**, **Expo ~50**, TypeScript-free JS
- expo-image-picker, expo-file-system, react-native-web

### Key File: `SignatureVerificationApp.js`
Single-component app. Platform-aware: uses `Platform.OS === 'web'` branches throughout.

- **Mobile**: `expo-image-picker` → camera or gallery → `expo-file-system` reads URI as Base64
- **Web**: hidden `<input type="file">` → `FileReader.readAsDataURL` → strips prefix to get raw Base64
- Sends Base64 strings to `POST /verify-base64`
- Displays result card (Genuine/Forged), confidence %, processing time

### API URL
Hardcoded in `SignatureVerificationApp.js:18`:
```js
const API_BASE_URL = 'http://192.168.1.103:8000';
```
Change this to match your machine's local IP when testing on a physical device. Both device and server must be on the same network.

### Running the Frontend
```bash
cd "signature_verification_react_native_app-master/signature_verification_react_native_app-master"
npm install
npm start           # Expo dev menu
npm run android     # Android emulator / device
npm run ios         # iOS simulator (macOS only)
npm run web         # Browser at localhost:19006
```

## Known Issues / Gotchas

- `verificationResult.similarity_score` is referenced in the results UI (`SignatureVerificationApp.js:444`) but the API response does not include a `similarity_score` field — it returns `genuine_score`. This will render `undefined`. Fix: change to `verificationResult.genuine_score`.
- The backend CORS policy is `allow_origins=["*"]` — fine for development, restrict for production.
- `best_model.pth` must be present in the backend working directory before starting the server; training must have been run at least once.
- `requirements.txt` is UTF-16 encoded (BOM present); `pip install -r requirements.txt` handles this correctly on most systems.

## Dataset

MCYT-100: 100 persons × genuine + forged subsets.
Expected directory layout (configured in `dataset.py`):
```
MCYT 100/
  MCYT_Signature_100originalConvertedGenuine/<person_id>/<img>.jpg
  MCYT_Signature_100originalConvertedForged/<person_id>/<img>.jpg
```
`DATASET_ROOT` in `train.py:23` points to the local absolute path — update this before training on a new machine.
