
import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from '@google/genai';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, limit } from 'firebase/firestore';

// Configuration for Firebase and Gemini API
const firebaseConfig = typeof window.__firebase_config !== 'undefined' ? JSON.parse(window.__firebase_config as string) : {};
const appId = typeof window.__app_id !== 'undefined' ? window.__app_id as string : 'default-app-id';
const initialAuthToken = typeof window.__initial_auth_token !== 'undefined' ? window.__initial_auth_token as string : null;

// The main App component
const App = () => {
  const [currentPage, setCurrentPage] = useState('home');
  const [questionText, setQuestionText] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [userScore, setUserScore] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);

  const ai = useMemo(
    () => new GoogleGenAI({ apiKey: process.env.API_KEY as string }),
    []
  );

  // Memoize Firebase app and services to avoid re-initializing.
  const firebaseServices = useMemo(() => {
    try {
      const apps = getApps();
      const app = apps.length > 0 ? apps[0] : initializeApp(firebaseConfig);
      const auth = getAuth(app);
      const db = getFirestore(app);
      return { app, auth, db };
    } catch (error) {
      console.error("Firebase initialization failed:", error);
      return { app: null, auth: null, db: null };
    }
  }, []);

  // Simplified mock question bank
  const questions = [
    {
      id: 1,
      text: "What is the capital of France?",
      options: ["Berlin", "Madrid", "Paris", "Rome"],
      answer: "Paris",
    },
    {
      id: 2,
      text: "Which planet is known as the Red Planet?",
      options: ["Venus", "Mars", "Jupiter", "Saturn"],
      answer: "Mars",
    },
    {
      id: 3,
      text: "What is the powerhouse of the cell?",
      options: ["Nucleus", "Ribosome", "Mitochondria", "Cytoplasm"],
      answer: "Mitochondria",
    },
  ];

  // Initialize Firebase and set up authentication listener
  useEffect(() => {
    if (!firebaseServices.auth) {
      // Fallback for failed initialization
      setUserId(crypto.randomUUID());
      setIsAuthReady(true);
      return;
    }

    const { auth } = firebaseServices;
    
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        } else {
          await signInAnonymously(auth);
        }
      }
      setUserId(auth.currentUser?.uid || crypto.randomUUID());
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, [firebaseServices]);

  // Fetch and listen for real-time leaderboard data
  useEffect(() => {
    if (!isAuthReady || !userId || !firebaseServices.db) return;

    const { db } = firebaseServices;
    // The query is ordered by score and limited to the top 10
    const leaderboardQuery = query(collection(db, `artifacts/${appId}/public/data/leaderboard`), orderBy("score", "desc"), limit(10));
    
    const unsubscribe = onSnapshot(leaderboardQuery, (querySnapshot) => {
      const scores: any[] = [];
      querySnapshot.forEach((doc) => {
        scores.push(doc.data());
      });
      setLeaderboardData(scores);
    }, (error) => {
      console.error("Error getting leaderboard data:", error);
    });

    return () => unsubscribe();
  }, [isAuthReady, userId, firebaseServices]);

  // Handler for AI doubt-solving
  const handleAiAsk = async () => {
    if (!questionText.trim()) return;
    setIsLoading(true);
    setAiResponse('');

    const prompt = `Act as a subject matter expert and provide a helpful, educational response to the following question, do not respond with just the answer, but rather a brief explanation: "${questionText}"`;
  
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      
      const text = response.text;
      if (text) {
        setAiResponse(text);
      } else {
        setAiResponse("Sorry, I couldn't generate a response. Please try again.");
      }
    } catch (error) {
      console.error("API call failed:", error);
      setAiResponse("An error occurred. Please check your network connection and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Handler for practicing questions
  const handleAnswerClick = (selectedAnswer: string) => {
    const isCorrect = selectedAnswer === questions[currentQuestion].answer;
    if (isCorrect) {
      setUserScore(userScore + 1);
      alert('Correct!');
    } else {
      alert('Incorrect!');
    }
    
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      const finalScore = userScore + (isCorrect ? 1 : 0);
      alert(`Quiz finished! Your score is ${finalScore} / ${questions.length}.`);
      updateLeaderboard(finalScore);
      setCurrentPage('home');
      setUserScore(0);
      setCurrentQuestion(0);
    }
  };

  // Function to update the Firestore leaderboard
  const updateLeaderboard = async (score: number) => {
    if (!isAuthReady || !userId || !firebaseServices.db) return;

    const { db } = firebaseServices;
    try {
      const leaderboardRef = collection(db, `artifacts/${appId}/public/data/leaderboard`);

      await addDoc(leaderboardRef, {
        userId: userId,
        score: score,
        timestamp: new Date().toISOString(),
      });
      console.log("Score added to leaderboard.");
    } catch (error) {
      console.error("Error updating leaderboard:", error);
    }
  };

  const renderContent = () => {
    switch (currentPage) {
      case 'home':
        return (
          <div className="flex flex-col items-center justify-center p-6 space-y-4">
            <h2 className="text-2xl font-bold">Welcome to Chorcha-like App</h2>
            <p className="text-gray-700">Choose an activity to start your preparation.</p>
            <div className="flex space-x-4">
              <button
                onClick={() => setCurrentPage('practice')}
                className="px-6 py-3 bg-blue-500 text-white font-semibold rounded-full shadow-lg hover:bg-blue-600 transition duration-300 ease-in-out transform hover:scale-105"
              >
                Start Practice
              </button>
              <button
                onClick={() => setCurrentPage('ai-help')}
                className="px-6 py-3 bg-green-500 text-white font-semibold rounded-full shadow-lg hover:bg-green-600 transition duration-300 ease-in-out transform hover:scale-105"
              >
                AI Doubt-Solver
              </button>
            </div>
            <div className="w-full max-w-lg mt-8 bg-gray-100 p-4 rounded-lg shadow-inner">
              <h3 className="text-xl font-bold text-center mb-4">Top 10 Scores</h3>
              {leaderboardData.length > 0 ? (
                <ul className="divide-y divide-gray-300">
                  {leaderboardData.map((item, index) => (
                    <li key={index} className="flex justify-between items-center py-2 px-3">
                      <span className="font-medium">{item.userId.substring(0, 8)}...</span>
                      <span className="font-bold text-lg text-blue-600">{item.score}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-center text-gray-500">No scores yet. Be the first to play!</p>
              )}
            </div>
          </div>
        );
      case 'practice':
        const question = questions[currentQuestion];
        return (
          <div className="flex flex-col items-center justify-center p-6 space-y-6">
            <h2 className="text-2xl font-bold">Quick Practice</h2>
            <div className="w-full max-w-lg p-6 bg-white rounded-lg shadow-md">
              <p className="text-lg font-semibold mb-4">{question.text}</p>
              <div className="flex flex-col space-y-3">
                {question.options.map((option, index) => (
                  <button
                    key={index}
                    onClick={() => handleAnswerClick(option)}
                    className="px-4 py-2 text-left bg-gray-100 rounded-lg shadow-sm hover:bg-gray-200 transition duration-200"
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-lg font-bold">Score: {userScore}</p>
            <button
              onClick={() => setCurrentPage('home')}
              className="mt-4 px-4 py-2 bg-red-500 text-white rounded-full shadow hover:bg-red-600 transition duration-300"
            >
              Back to Home
            </button>
          </div>
        );
      case 'ai-help':
        return (
          <div className="flex flex-col items-center justify-center p-6 space-y-6">
            <h2 className="text-2xl font-bold">AI Doubt-Solver</h2>
            <textarea
              className="w-full max-w-xl p-4 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={6}
              placeholder="Ask me a question about any subject..."
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
            ></textarea>
            <button
              onClick={handleAiAsk}
              disabled={isLoading}
              className="px-6 py-3 bg-blue-500 text-white font-semibold rounded-full shadow-lg hover:bg-blue-600 transition duration-300 ease-in-out transform hover:scale-105 disabled:bg-gray-400"
            >
              {isLoading ? 'Thinking...' : 'Ask AI'}
            </button>
            <div className="w-full max-w-xl p-6 bg-white rounded-lg shadow-md min-h-[150px]">
              <p className="font-semibold text-gray-800">AI Response:</p>
              <p className="mt-2 text-gray-600 whitespace-pre-wrap">{aiResponse}</p>
            </div>
            <button
              onClick={() => setCurrentPage('home')}
              className="mt-4 px-4 py-2 bg-red-500 text-white rounded-full shadow hover:bg-red-600 transition duration-300"
            >
              Back to Home
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-3xl border border-gray-200">
        <h1 className="text-4xl font-extrabold text-center mb-6 text-blue-700">Chorcha Clone</h1>
        {isAuthReady ? renderContent() : <p>Initializing...</p>}
      </div>
    </div>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);
