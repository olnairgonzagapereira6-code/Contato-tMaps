import { render, screen } from '@testing-library/react';
import ChatVideoRTC from './ChatVideoRTC';

describe('ChatVideoRTC', () => {
  it('renders the chat container', () => {
    render(<ChatVideoRTC />);
    const chatContainer = screen.getByRole('main');
    expect(chatContainer).toBeInTheDocument();
  });
});
