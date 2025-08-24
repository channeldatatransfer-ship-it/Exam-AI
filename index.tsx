import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from '@google/genai';

const App = () => {
  type ExamQuestion = {
    question: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
  };

  type AppState = 'start' | 'loading' | 'in_progress' | 'results';

  const EXAM_DURATION_SECONDS = 300; // 5 minutes

  const [appState, setAppState] = useState<AppState>('start');
  const [topic, setTopic] = useState<string>('World History');
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>([]);
  const [userAnswers, setUserAnswers] = useState<string[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState(EXAM_DURATION_SECONDS);
  const [timeUp, setTimeUp] = useState(false);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme || 'light';
  });

  useEffect(() => {
    document.body.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  const ai = useMemo(
    () => new GoogleGenAI({ apiKey: process.env.API_KEY as string }),
    []
  );

  const handleSubmit = useCallback(() => {
    if (timeLeft <= 0) {
      setTimeUp(true);
    }
    setAppState('results');
  }, [timeLeft]);


  useEffect(() => {
    if (appState !== 'in_progress') {
      return;
    }

    if (timeLeft === 0) {
      handleSubmit();
      return;
    }

    const timerId = setInterval(() => {
      setTimeLeft((prevTime) => prevTime - 1);
    }, 1000);

    return () => clearInterval(timerId);
  }, [appState, timeLeft, handleSubmit]);


  const generateExam = async (examTopic = topic) => {
    setAppState('loading');
    setTopic(examTopic);
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Generate a 10-question multiple-choice exam on the topic of ${examTopic}.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              questions: {
                type: Type.ARRAY,
                description: 'An array of 10 multiple-choice questions.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: {
                      type: Type.STRING,
                      description: 'The question text.',
                    },
                    options: {
                      type: Type.ARRAY,
                      description:
                        'An array of 4 possible answers (strings).',
                      items: { type: Type.STRING },
                    },
                    correctAnswer: {
                      type: Type.STRING,
                      description: 'The correct answer from the options.',
                    },
                    explanation: {
                      type: Type.STRING,
                      description:
                        'A brief explanation of why the answer is correct.',
                    },
                  },
                  required: [
                    'question',
                    'options',
                    'correctAnswer',
                    'explanation',
                  ],
                },
              },
            },
            required: ['questions'],
          },
        },
      });

      const examData = JSON.parse(response.text);
      if (examData.questions && examData.questions.length > 0) {
        setExamQuestions(examData.questions);
        setUserAnswers(new Array(examData.questions.length).fill(null));
        setCurrentQuestionIndex(0);
        setTimeLeft(EXAM_DURATION_SECONDS);
        setTimeUp(false);
        setAppState('in_progress');
      } else {
        throw new Error('Failed to generate exam questions.');
      }
    } catch (error) {
      console.error('Error generating exam:', error);
      alert(
        'Sorry, there was an error generating the exam. Please try again.'
      );
      setAppState('start');
    }
  };

  const handleCurriculumSelect = (selectedTopic: string) => {
    setIsPopupOpen(false);
    generateExam(selectedTopic);
  };

  const handleAnswerSelect = (answer: string) => {
    const newAnswers = [...userAnswers];
    newAnswers[currentQuestionIndex] = answer;
    setUserAnswers(newAnswers);
  };

  const handleNext = () => {
    if (currentQuestionIndex < examQuestions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };
  
  const handleReset = () => {
    setAppState('start');
    setExamQuestions([]);
    setUserAnswers([]);
    setCurrentQuestionIndex(0);
    setTopic('World History');
    setTimeUp(false);
  };

  const calculateScore = () => {
    return userAnswers.reduce((score, answer, index) => {
      if (answer === examQuestions[index].correctAnswer) {
        return score + 1;
      }
      return score;
    }, 0);
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  };

  const renderContent = () => {
    switch (appState) {
      case 'loading':
        return (
          <div className="card loading-card">
            <div className="spinner"></div>
            <h2>Generating your exam on {topic}...</h2>
            <p>Please wait a moment.</p>
          </div>
        );
      case 'in_progress':
        const currentQuestion = examQuestions[currentQuestionIndex];
        return (
          <div className="card exam-card">
            <div className="exam-header">
              <h2>{topic} Exam</h2>
              <div className="exam-meta">
                <p className={`timer ${timeLeft <= 30 ? 'low-time' : ''}`}>
                  {formatTime(timeLeft)}
                </p>
                <p className="progress">
                  Question {currentQuestionIndex + 1} of {examQuestions.length}
                </p>
              </div>
            </div>
            <div className="question-container">
              <h3>{currentQuestion.question}</h3>
              <div className="options-container">
                {currentQuestion.options.map((option, index) => (
                  <button
                    key={index}
                    className={`option-btn ${
                      userAnswers[currentQuestionIndex] === option
                        ? 'selected'
                        : ''
                    }`}
                    onClick={() => handleAnswerSelect(option)}
                    aria-pressed={userAnswers[currentQuestionIndex] === option}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            <div className="navigation-buttons">
              <button onClick={handlePrevious} disabled={currentQuestionIndex === 0}>
                Previous
              </button>
              {currentQuestionIndex < examQuestions.length - 1 ? (
                <button onClick={handleNext}>Next</button>
              ) : (
                <button onClick={handleSubmit} className="primary">Submit</button>
              )}
            </div>
          </div>
        );
        case 'results':
          const score = calculateScore();
          return (
            <div className="card results-card">
              <h2>Exam Results</h2>
              {timeUp && <p className="time-up-message">Time's up!</p>}
              <p className="score">
                You scored {score} out of {examQuestions.length}!
              </p>
              <div className="review-section">
                {examQuestions.map((question, index) => (
                  <div key={index} className="review-question">
                    <h4>{index + 1}. {question.question}</h4>
                    <p className={`result ${userAnswers[index] === question.correctAnswer ? 'correct' : 'incorrect'}`}>
                      Your answer: {userAnswers[index] || 'Not answered'}
                    </p>
                    {userAnswers[index] !== question.correctAnswer && (
                      <p className="correct-answer">Correct answer: {question.correctAnswer}</p>
                    )}
                    <p className="explanation"><strong>Explanation:</strong> {question.explanation}</p>
                  </div>
                ))}
              </div>
              <button onClick={handleReset} className="primary">Take Another Exam</button>
            </div>
          );
      case 'start':
      default:
        return (
          <div className="card start-card">
            <h1>AI Exam Generator</h1>
            <p>Select a topic, or choose from the Bangladesh curriculum to generate a custom exam instantly.</p>
            <div className="topic-selector">
              <label htmlFor="topic-select">Choose a topic:</label>
              <select id="topic-select" value={topic} onChange={(e) => setTopic(e.target.value)}>
                <option value="World History">World History</option>
                <option value="Astrophysics">Astrophysics</option>
                <option value="Marine Biology">Marine Biology</option>
                <option value="Classical Music">Classical Music</option>
                <option value="JavaScript Fundamentals">JavaScript Fundamentals</option>
              </select>
            </div>
            <div className="start-actions">
              <button className="primary" onClick={() => generateExam()}>Generate Exam</button>
              <button onClick={() => setIsPopupOpen(true)}>View Bangladesh Curriculum</button>
            </div>
          </div>
        );
    }
  };

  const renderPopup = () => {
    if (!isPopupOpen) return null;

    return (
      <div className="popup-overlay" onClick={() => setIsPopupOpen(false)}>
        <div className="popup-content" onClick={(e) => e.stopPropagation()}>
          <button className="popup-close-btn" onClick={() => setIsPopupOpen(false)} aria-label="Close popup">&times;</button>
          <h2>Bangladesh Education Curriculum</h2>
          <div className="popup-body">
            <button onClick={() => handleCurriculumSelect('Bangladesh Primary Level (Classes 1-5)')}>
              Primary Level (Classes 1-5)
            </button>
            <button onClick={() => handleCurriculumSelect('Bangladesh Junior Secondary Level (Classes 6-8)')}>
              Junior Secondary Level (Classes 6-8)
            </button>
            <button onClick={() => handleCurriculumSelect('Bangladesh Secondary Level (Classes 9-10)')}>
              Secondary Level (Classes 9-10)
            </button>
            <button onClick={() => handleCurriculumSelect('Bangladesh Higher Secondary (Science)')}>
              Higher Secondary (Science)
            </button>
            <button onClick={() => handleCurriculumSelect('Bangladesh Higher Secondary (Arts/Humanities)')}>
              Higher Secondary (Arts/Humanities)
            </button>
            <button onClick={() => handleCurriculumSelect('Bangladesh Higher Secondary (Commerce/Business)')}>
              Higher Secondary (Commerce/Business)
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <button
        onClick={toggleTheme}
        className="theme-toggle"
        aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      >
        {theme === 'light' ? '🌙' : '☀️'}
      </button>
      <main>{renderContent()}</main>
      {renderPopup()}
    </>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);