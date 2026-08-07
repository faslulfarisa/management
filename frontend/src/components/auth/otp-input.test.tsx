import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OtpInput } from './otp-input';

describe('OtpInput', () => {
  it('renders one box per digit and focuses the first box', () => {
    render(<OtpInput value="" onChange={() => {}} />);
    const boxes = screen.getAllByLabelText(/Digit \d/);
    expect(boxes).toHaveLength(6);
    expect(boxes[0]).toHaveFocus();
  });

  it('auto-advances to the next box after typing a digit', () => {
    const onChange = vi.fn();
    render(<OtpInput value="" onChange={onChange} />);
    const boxes = screen.getAllByLabelText(/Digit \d/) as HTMLInputElement[];

    fireEvent.change(boxes[0], { target: { value: '4' } });

    expect(onChange).toHaveBeenCalledWith('4');
  });

  it('moves focus to the previous box on backspace from an empty box', () => {
    const onChange = vi.fn();
    render(<OtpInput value="12" onChange={onChange} />);
    const boxes = screen.getAllByLabelText(/Digit \d/) as HTMLInputElement[];

    boxes[2].focus();
    fireEvent.keyDown(boxes[2], { key: 'Backspace' });

    expect(boxes[1]).toHaveFocus();
    expect(onChange).toHaveBeenCalledWith('1');
  });

  it('clears the current digit on backspace without moving focus when the box is not empty', () => {
    const onChange = vi.fn();
    render(<OtpInput value="123" onChange={onChange} />);
    const boxes = screen.getAllByLabelText(/Digit \d/) as HTMLInputElement[];

    boxes[1].focus();
    fireEvent.keyDown(boxes[1], { key: 'Backspace' });

    expect(onChange).toHaveBeenCalledWith('1' + '' + '3');
  });

  it('distributes a pasted code across all boxes', () => {
    const onChange = vi.fn();
    render(<OtpInput value="" onChange={onChange} />);
    const boxes = screen.getAllByLabelText(/Digit \d/) as HTMLInputElement[];

    fireEvent.paste(boxes[0], { clipboardData: { getData: () => '123456' } });

    expect(onChange).toHaveBeenCalledWith('123456');
  });

  it('strips non-digit characters from a paste', () => {
    const onChange = vi.fn();
    render(<OtpInput value="" onChange={onChange} />);
    const boxes = screen.getAllByLabelText(/Digit \d/) as HTMLInputElement[];

    fireEvent.paste(boxes[0], { clipboardData: { getData: () => '12-34 56' } });

    expect(onChange).toHaveBeenCalledWith('123456');
  });
});
