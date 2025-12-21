import React from 'react';

interface YouTubeBlockProps {
  videoIds: string[];
}

const YouTubeBlock: React.FC<YouTubeBlockProps> = ({ videoIds }) => {
  return (
    <div className="youtube-block-section">
      <h2 className="header">VÍDEOS DO YOUTUBE</h2>
      <div className="youtube-grid">
        {videoIds.map(id => (
          <div key={id} className="youtube-video">
            <iframe
              src={`https://www.youtube.com/embed/${id}`}
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          </div>
        ))}
      </div>
    </div>
  );
};

export default YouTubeBlock;
