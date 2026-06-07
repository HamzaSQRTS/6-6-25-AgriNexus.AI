// frontend/src/app/layout.js
import './globals.css';
import Script from 'next/script';

export const metadata = {
  title: 'AgriNexus.Ai — Transforming Agriculture',
  description: 'Intelligent AI Agriculture Advisor providing crop recommendations and disease diagnosis.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        {children}
        <div id="toast-container"></div>
      </body>
    </html>
  );
}
