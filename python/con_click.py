import time
import pyautogui

from pynput import keyboard


clicking_active = True
target_position = None


def getTimeInterval():
    try:
        return float(input("Please enter the interval(Unit: s):"))
    except ValueError:
        print("Error input!")
        exit()


def clickPosRecord(key):
    """Record the mouse position when pressing F8"""
    global target_position
    try:
        if key == keyboard.Key.f8:
            target_position = pyautogui.position()
            print(f"Position: {target_position}")

            return False
    except AttributeError:
        pass


def clickPosListen():
    """Waiting for F8..."""
    print("Please move the mouse to the target position and press F8...")
    with keyboard.Listener(on_press=clickPosRecord) as listener:
        listener.join()
    if not target_position:
        print("Error: Invalid position!")
        exit()


def clickStop(key):
    """Esc Stop..."""
    global clicking_active
    if key == keyboard.Key.esc:
        clicking_active = False
        print("Stop clicking...")

        return False


def clickStart(interval):
    x, y = target_position

    print(f"Start clicking ({x}, {y}) every {interval} seconds.")
    print("Press Esc to stop...")

    stop_listener = keyboard.Listener(on_press=clickStop)
    stop_listener.start()

    try:
        while clicking_active:
            pyautogui.click(x=x, y=y)

            start_time = time.time()
            while clicking_active and (time.time() - start_time) < interval:
                time.sleep(0.01)

    except Exception as err:
        print(f"Error: {err}")
    finally:
        stop_listener.stop()

    print("Exit...")


def main():
    interval = getTimeInterval()
    clickPosListen()
    clickStart(interval=interval)


if __name__ == "__main__":
    main()
