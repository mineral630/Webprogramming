import React, { useState, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

function Counter() {
  const [count, setCount] = useState(0);

  function handleClick() {
    setCount(count + 1);
  }

  return (
    <section>
      <h2>1. Counter</h2>
      <button onClick={handleClick}>
        You pressed me {count} times
      </button>
    </section>
  );
}

function MyInput() {
  const [text, setText] = useState('hello');

  function handleChange(e) {
    setText(e.target.value);
  }

  return (
    <section>
      <h2>2. Text Input</h2>
      <input value={text} onChange={handleChange} />
      <p>You typed: {text}</p>
      <button onClick={() => setText('zzzz')}>
        Reset
      </button>
    </section>
  );
}

function MyCheckbox() {
  const [liked, setLiked] = useState(true);

  function handleChange(e) {
    setLiked(e.target.checked);
  }

  return (
    <section>
      <h2>3. Checkbox</h2>
      <label>
        <input
          type="checkbox"
          checked={liked}
          onChange={handleChange}
        />
        I liked this
      </label>
      <p>You {liked ? 'liked' : 'did not like'} this.</p>
    </section>
  );
}

function Form() {
  const [name, setName] = useState('Taylor');
  const [age, setAge] = useState(0);

  return (
    <section>
      <h2>4. Multiple State Form</h2>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
      />
      <button onClick={() => setAge(age + 1)}>
        Increment age
      </button>
      <button onClick={() => setAge(age - 1)}>
        Decrement age
      </button>
      <p>Hello, {name}. You are {age}.</p>
    </section>
  );
}

// 메인 통합 App 컴포넌트
export default function App() {
  return (
    <div className="container">
      <h1>React State Examples Bundle</h1>
      <Counter />
      <MyInput />
      <MyCheckbox />
      <Form />
    </div>
  );
}
