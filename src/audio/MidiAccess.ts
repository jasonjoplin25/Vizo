export type NoteOnCallback = (midiNote: number, velocity: number) => void;
export type NoteOffCallback = (midiNote: number) => void;

export class MidiAccess {
  private access: MIDIAccess | null = null;
  private onNoteOn: NoteOnCallback;
  private onNoteOff: NoteOffCallback;

  constructor(onNoteOn: NoteOnCallback, onNoteOff: NoteOffCallback) {
    this.onNoteOn = onNoteOn;
    this.onNoteOff = onNoteOff;
  }

  async connect(): Promise<string[]> {
    if (!navigator.requestMIDIAccess) {
      throw new Error('Web MIDI API not supported in this browser.');
    }
    this.access = await navigator.requestMIDIAccess();
    const devices: string[] = [];

    this.access.inputs.forEach(input => {
      input.onmidimessage = this.handleMessage;
      devices.push(input.name ?? 'Unknown Device');
    });

    this.access.onstatechange = () => {
      this.access?.inputs.forEach(input => {
        input.onmidimessage = this.handleMessage;
      });
    };

    return devices;
  }

  private handleMessage = (event: MIDIMessageEvent) => {
    if (!event.data) return;
    const [status, note, velocity] = Array.from(event.data);
    const command = status & 0xf0;

    if (command === 0x90 && velocity > 0) {
      // Note On
      this.onNoteOn(note, velocity);
    } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
      // Note Off
      this.onNoteOff(note);
    }
  };

  disconnect() {
    if (this.access) {
      this.access.inputs.forEach(input => {
        input.onmidimessage = null;
      });
    }
  }
}
