import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, query, orderBy } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBDnON6yUGlv1UTL7BxF6Gqrj1ZylqPEIA",
  authDomain: "cuckoo-ai-survey.firebaseapp.com",
  projectId: "cuckoo-ai-survey",
  storageBucket: "cuckoo-ai-survey.firebasestorage.app",
  messagingSenderId: "342758133908",
  appId: "1:342758133908:web:924c3f9dff9043ff83a481",
  measurementId: "G-W7BT2QSRWZ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function saveResult(entry) {
  try {
    await addDoc(collection(db, "survey_results"), {
      ...entry,
      created_at: new Date().toISOString()
    });
    return true;
  } catch (e) {
    console.error("저장 실패:", e);
    return false;
  }
}

export async function getResults() {
  try {
    const q = query(collection(db, "survey_results"), orderBy("created_at", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (e) {
    console.error("조회 실패:", e);
    return [];
  }
}
