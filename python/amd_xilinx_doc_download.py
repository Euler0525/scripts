"""
msedgedriver.exe
https://msedgewebdriverstorage.z22.web.core.windows.net/?form=MA13LH
"""


from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from bs4 import BeautifulSoup
import os
import time
import re
import urllib.parse
from selenium.webdriver.edge.service import Service
from selenium.webdriver.edge.options import Options
from selenium.common.exceptions import TimeoutException, ElementClickInterceptedException, NoSuchElementException, StaleElementReferenceException


# -------------------------- 自定义配置 --------------------------
SEARCH_URL = "https://docs.amd.com/search/all?value-filters=Document_Type_custom~%2522Data+Sheet%2522_%2522Introductory+Resources%257CProduct+Brief%2522_%2522Introductory+Resources%257CSelection+Guide%2522_%2522Introductory+Resources%257CWhite+Paper%2522_%2522User+Guides+%2526+Manuals%257CDesign+Hub%2522_%2522User+Guides+%2526+Manuals%257CUser+Guide%2522*Product_custom~%2522Adaptive+SoCs+%2526+FPGAs%257CAdaptive+SoC%257CVersal+AI+Edge+Series%2522&content-lang=en-US"
DOWNLOAD_DIR = "./AMD_Versal_PDFs"  # 指定PDF下载目录
EDGEDRIVER_PATH = "./msedgedriver.exe"
WAIT_TIME = 120
RETRY_TIMES = 2
ENABLE_MANUAL_CONFIRM = False  # 关闭手动确认，改为自动等待
MAX_LOAD_MORE_ATTEMPTS = 100  # 最大点击次数
MAX_CONTINUOUS_ERRORS = 3  # 连续加载异常最大次数，达到后停止检测

# 目标链接的正则匹配规则
TARGET_LINK_PATTERN = r"https://docs\.amd\.com/r/en-US/[\w\-/]+/?$"
# ----------------------------------------------------------------

def init_driver():
    """初始化驱动（兼容所有网络/渲染场景）"""
    edge_options = Options()

    # 核心：关闭所有安全限制（解决AMD页面反爬/渲染问题）
    edge_options.add_argument("--no-sandbox")
    edge_options.add_argument("--disable-dev-shm-usage")
    edge_options.add_argument("--ignore-certificate-errors")
    edge_options.add_argument("--ignore-ssl-errors")
    edge_options.add_argument("--allow-running-insecure-content")
    edge_options.add_argument("--disable-web-security")
    edge_options.add_argument("--disable-features=IsolateOrigins,site-per-process")

    # 强制启用JS和渲染（关键）
    edge_options.add_argument("--enable-javascript")
    edge_options.add_argument("--enable-dom-storage")
    edge_options.add_argument("--enable-remote-fonts")
    edge_options.add_argument("--enable-plugins")

    # 禁用反爬相关特征
    edge_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    edge_options.add_experimental_option('useAutomationExtension', False)
    edge_options.add_argument("--disable-blink-features=AutomationControlled")

    # 下载配置（强制保存到指定目录，禁用PDF预览）
    prefs = {
        "download.default_directory": os.path.abspath(DOWNLOAD_DIR),
        "download.prompt_for_download": False,
        "download.directory_upgrade": True,
        "plugins.always_open_pdf_externally": True,  # 直接下载不预览
        "pdfjs.disabled": True,  # 禁用内置PDF阅读器
        "profile.default_content_settings.popups": 0,
        "profile.content_settings.exceptions.automatic_downloads.*.setting": 1,
    }
    edge_options.add_experimental_option("prefs", prefs)

    # 性能优化（保留图片加载，避免页面检测）
    edge_options.add_argument("--start-maximized")
    edge_options.add_argument("--disable-cache")
    edge_options.add_argument("--log-level=3")  # 屏蔽日志
    edge_options.add_experimental_option("excludeSwitches", ["enable-logging"])

    # 配置驱动
    service = Service(
        executable_path=EDGEDRIVER_PATH,
        log_path=os.devnull
    )

    driver = webdriver.Edge(service=service, options=edge_options)
    driver.set_page_load_timeout(WAIT_TIME)
    driver.set_script_timeout(WAIT_TIME)
    driver.implicitly_wait(15)

    # 移除webdriver特征（防检测）
    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")

    return driver

def wait_for_fluidtopics_content(driver):
    """增强版：等待页面渲染（自动等待0.5秒兜底）"""
    try:
        # 阶段1：等待加载器消失
        print("🔍 等待页面加载器消失...")
        WebDriverWait(driver, WAIT_TIME).until(
            EC.invisibility_of_element_located((By.ID, "FT-application-loader"))
        )

        # 阶段2：等待核心内容容器
        print("🔍 等待核心内容加载...")
        WebDriverWait(driver, WAIT_TIME).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "body > div"))
        )

        # 阶段3：强制执行JS渲染（主动触发）
        print("🔍 强制触发页面JS渲染...")
        driver.execute_script("""
            window.scrollTo(0, document.body.scrollHeight);
            window.scrollTo(0, 0);
            if (window.FT) {
                FT.reloadContent();
            }
        """)
        time.sleep(3)

        # 自动等待0.5秒（替代手动按Enter）
        if ENABLE_MANUAL_CONFIRM:
            print("\n⚠️ 自动等待0.5秒，跳过手动确认步骤...")
            time.sleep(0.2)

    except TimeoutException:
        print("⚠️ 自动等待超时！")
        if ENABLE_MANUAL_CONFIRM:
            print("⚠️ 自动等待0.5秒，模拟手动确认步骤...")
            time.sleep(0.2)
        else:
            raise Exception("❌ Fluid Topics框架加载超时")

def click_load_more_until_all(driver):
    """反复点击Load more results按钮，无按钮/连续3次加载异常时立即停止"""
    click_count = 0
    continuous_error_count = 0  # 连续加载异常计数
    print("\n🔄 开始循环点击「加载更多结果」按钮...")

    while click_count < MAX_LOAD_MORE_ATTEMPTS:
        # 先判断连续异常是否达到阈值，达到则直接停止
        if continuous_error_count >= MAX_CONTINUOUS_ERRORS:
            print(f"\n❌ 连续{MAX_CONTINUOUS_ERRORS}次点击后加载异常，停止检测按钮，执行后续流程")
            break

        # 第一步：先快速检测按钮是否存在（超时仅3秒，确保快速判断）
        try:
            load_more_span = WebDriverWait(driver, 3).until(
                EC.presence_of_element_located(
                    (By.XPATH, "//span[@class='ft-btn-inner-text' and (text()='加载更多结果' or text()='Load more results')]")
                )
            )
            load_more_btn = load_more_span.find_element(By.XPATH, "./parent::button")
        except (TimeoutException, NoSuchElementException):
            # 无按钮时直接停止，不重试
            print(f"\n✅ 未检测到「加载更多结果」按钮（已点击{click_count}次），确认所有结果加载完成")
            break

        # 按钮存在时执行点击逻辑
        try:
            # 滚动到按钮位置（确保可见）
            driver.execute_script("arguments[0].scrollIntoView({block: 'center', behavior: 'smooth'});", load_more_btn)
            time.sleep(0.3)

            # 尝试点击（优先原生点击，失败则用JS强制点击）
            try:
                load_more_btn.click()
            except (ElementClickInterceptedException, StaleElementReferenceException):
                print(f"⚠️ 第{click_count+1}次点击被拦截/元素失效，使用JS强制点击...")
                driver.execute_script("arguments[0].click();", load_more_btn)

            click_count += 1
            print(f"✅ 第{click_count}次点击「加载更多结果」，等待新结果加载...")

            # 等待新内容加载（检测页面内容变化）
            WebDriverWait(driver, 15).until(
                lambda d: len(d.find_elements(By.TAG_NAME, "a")) > (click_count * 20)  # 假设每次加载20条
            )
            time.sleep(0.2)  # 额外等待确保渲染完成

            # 加载成功，重置连续异常计数
            continuous_error_count = 0

        except Exception as e:
            continuous_error_count += 1
            print(f"⚠️ 第{click_count}次点击后加载异常（连续异常{continuous_error_count}/{MAX_CONTINUOUS_ERRORS}）：{str(e)[:80]}")
            time.sleep(0.2)
            continue

    # 最大次数兜底提示
    if click_count >= MAX_LOAD_MORE_ATTEMPTS:
        print(f"\n⚠️ 达到最大点击次数（{MAX_LOAD_MORE_ATTEMPTS}次），停止加载更多结果")

def extract_target_links(driver):
    """提取 https://docs.amd.com/r/en-US/ 格式的所有链接"""
    driver.execute_script("document.documentElement.scrollTop = 0;")
    time.sleep(0.2)
    page_source = driver.page_source

    print(f"\n📄 开始提取链接 - 页面源码长度：{len(page_source)} 字符")

    # 初始化正则匹配器
    link_pattern = re.compile(TARGET_LINK_PATTERN, re.IGNORECASE)
    target_links = []

    # 方案1：Selenium直接定位（优先）
    try:
        print("🔍 正在提取目标格式链接（Selenium）...")
        all_a_tags = driver.find_elements(By.TAG_NAME, "a")
        for a_tag in all_a_tags:
            href = a_tag.get_attribute("href")
            if href and link_pattern.match(href):
                target_links.append(href)
                # 每提取50个链接打印一次进度
                if len(target_links) % 50 == 0:
                    print(f"   已提取{len(target_links)}个目标链接...")
        print(f"📌 Selenium提取到 {len(target_links)} 个目标链接")
    except Exception as e:
        print(f"⚠️ Selenium提取链接失败：{e}")

    # 方案2：BeautifulSoup兜底
    if not target_links:
        print("🔍 Selenium未提取到链接，尝试BeautifulSoup解析...")
        soup = BeautifulSoup(page_source, "html.parser")
        all_a = soup.find_all("a", href=True)
        for a in all_a:
            href = a["href"]
            if not href.startswith("http"):
                href = urllib.parse.urljoin("https://docs.amd.com", href)
            if link_pattern.match(href):
                target_links.append(href)
                if len(target_links) % 50 == 0:
                    print(f"   已提取{len(target_links)}个目标链接（BS4）...")

    # 去重（基础去重，后续会按子目录深度去重）
    target_links = list(set(target_links))
    print(f"\n📊 初始去重后结果：共找到 {len(target_links)} 个唯一的目标链接")

    # 打印前10个和最后10个链接（避免输出过长）
    if target_links:
        print("\n📋 初始提取的链接预览（前10 + 最后10）：")
        preview_links = target_links[:10] + (target_links[-10:] if len(target_links) > 10 else [])
        for idx, link in enumerate(preview_links, 1):
            print(f"   [{idx}] {link}")
        if len(target_links) > 20:
            print(f"   ... 省略中间{len(target_links)-20}个链接")

    return target_links

def get_link_subdirectory(link):
    """提取链接的核心子目录（r/en-US/后的第一个目录层级）"""
    try:
        # 固定前缀
        prefix = "https://docs.amd.com/r/en-US/"
        if not link.startswith(prefix):
            return link  # 非目标格式链接，用自身作为标识

        # 截取前缀后的部分
        suffix = link[len(prefix):]
        # 拆分第一个/前的内容作为核心子目录
        subdirectory = suffix.split('/')[0] if '/' in suffix else suffix
        return subdirectory
    except Exception as e:
        print(f"⚠️ 解析链接子目录失败 [{link}]：{str(e)[:50]}")
        return link  # 解析失败时用原链接作为标识

def deduplicate_links_by_subdirectory(link_list):
    """基于核心子目录去重链接，保留每个子目录的第一个出现的链接"""
    subdir_map = {}  # 记录已出现的子目录及其对应的第一个链接
    deduplicated_links = []

    print("\n🔍 开始按核心子目录去重链接...")
    for link in link_list:
        subdir = get_link_subdirectory(link)
        if subdir not in subdir_map:
            # 子目录未出现过，保留链接
            subdir_map[subdir] = link
            deduplicated_links.append(link)
        else:
            # 子目录已存在，跳过当前链接
            print(f"   🔄 重复子目录 [{subdir}]，跳过链接：{link}")
            print(f"      ↳ 已保留：{subdir_map[subdir]}")

    return deduplicated_links

def click_pdf_attachments_icon(driver):
    """精准定位：PDF 和附件标签下的 ft-icon-no-icon 图标"""
    try:
        # 精准XPath定位：基于层级结构定位PDF和附件标签的no-icon
        xpath = """//aside[@class='component-aside']
                   /div[@class='fluid-aside readeraside-menu component-aside-inner-wrapper']
                   /div[@class='fluid-aside-tabs']
                   /nav[@class='fluid-aside-tabs-inner-wrapper']
                   /button[contains(@class, 'fluid-aside-tab-id-mapattachments')]
                   /i[@class='ft-icon ft-icon-no-icon' and @aria-hidden='true']"""

        print("🔘 定位PDF和附件标签的ft-icon-no-icon图标...")
        icon_element = WebDriverWait(driver, 20).until(
            EC.element_to_be_clickable((By.XPATH, xpath))
        )

        # 滚动到元素位置
        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", icon_element)
        time.sleep(0.2)

        # 强制点击
        driver.execute_script("arguments[0].click();", icon_element)
        print("✅ 成功点击PDF和附件标签的ft-icon-no-icon图标")
        return True

    except (TimeoutException, NoSuchElementException):
        print("❌ 未找到PDF和附件标签的ft-icon-no-icon图标")
        # 尝试备选定位方案
        try:
            alt_xpath = "//button[contains(@aria-label, 'PDF 和附件')]/i[@class='ft-icon ft-icon-no-icon']"
            icon_element = WebDriverWait(driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, alt_xpath))
            )
            driver.execute_script("arguments[0].click();", icon_element)
            print("✅ 备选方案：成功点击PDF和附件标签的ft-icon-no-icon图标")
            return True
        except Exception as e:
            print(f"❌ 备选方案也失败：{e}")
            return False
    except ElementClickInterceptedException:
        print("⚠️ PDF和附件图标被遮挡，尝试点击父按钮...")
        try:
            # 直接点击父按钮
            parent_btn_xpath = """//aside[@class='component-aside']
                                  /div[@class='fluid-aside readeraside-menu component-aside-inner-wrapper']
                                  /div[@class='fluid-aside-tabs']
                                  /nav[@class='fluid-aside-tabs-inner-wrapper']
                                  /button[contains(@class, 'fluid-aside-tab-id-mapattachments')]"""
            parent_btn = driver.find_element(By.XPATH, parent_btn_xpath)
            driver.execute_script("arguments[0].click();", parent_btn)
            print("✅ 成功点击PDF和附件标签的父按钮")
            return True
        except Exception as e:
            print(f"❌ 点击父按钮失败：{e}")
            return False
    except Exception as e:
        print(f"❌ 点击PDF和附件图标异常：{e}")
        return False

def click_pdf_download_icon(driver):
    """精准定位：下载PDF按钮的ft-icon-download图标"""
    try:
        # 精准XPath定位：基于层级结构定位下载按钮的download图标
        xpath = """//aside[@class='component-aside']
                   /div[@class='fluid-aside readeraside-menu component-aside-inner-wrapper']
                   /div[@class='fluid-aside-content']
                   /div[@class='fluid-aside-content-wrapper']
                   /div[@class='mapattachments-container']
                   //button[contains(@class, 'mapattachments-download-button')]
                   /i[@class='ft-icon ft-icon-download' and @aria-hidden='true']"""

        print("🔘 定位PDF下载按钮的ft-icon-download图标...")
        # 等待下载区域加载
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.CLASS_NAME, "mapattachments-container"))
        )

        download_icon = WebDriverWait(driver, 20).until(
            EC.element_to_be_clickable((By.XPATH, xpath))
        )

        # 滚动到元素位置
        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", download_icon)
        time.sleep(0.2)

        # 强制点击触发下载
        driver.execute_script("arguments[0].click();", download_icon)
        print("✅ 成功点击PDF下载按钮的ft-icon-download图标")
        return True

    except (TimeoutException, NoSuchElementException):
        print("❌ 未找到PDF下载按钮的ft-icon-download图标")
        # 尝试备选定位方案
        try:
            alt_xpath = "//button[contains(@aria-label, '下载 PDF')]/i[@class='ft-icon ft-icon-download']"
            download_icon = WebDriverWait(driver, 10).until(
                EC.element_to_be_clickable((By.XPATH, alt_xpath))
            )
            driver.execute_script("arguments[0].click();", download_icon)
            print("✅ 备选方案：成功点击PDF下载按钮的ft-icon-download图标")
            return True
        except Exception as e:
            print(f"❌ 备选方案也失败：{e}")
            return False
    except ElementClickInterceptedException:
        print("⚠️ 下载图标被遮挡，尝试点击父按钮...")
        try:
            parent_btn_xpath = "//button[contains(@class, 'mapattachments-download-button')]"
            parent_btn = driver.find_element(By.XPATH, parent_btn_xpath)
            driver.execute_script("arguments[0].click();", parent_btn)
            print("✅ 成功点击下载按钮的父按钮")
            return True
        except Exception as e:
            print(f"❌ 点击下载父按钮失败：{e}")
            return False
    except Exception as e:
        print(f"❌ 点击下载图标异常：{e}")
        return False

def download_pdf(driver, doc_url, retry=0):
    """重构下载逻辑：精准定位层级结构中的图标"""
    if retry >= RETRY_TIMES:
        print(f"❌ 重试耗尽，放弃下载：{doc_url}")
        return False

    try:
        print(f"\n🌐 访问文档页：{doc_url}")
        driver.get(doc_url)

        # 等待文档页完全渲染
        wait_for_fluidtopics_content(driver)

        # 步骤1：点击PDF和附件标签的ft-icon-no-icon
        print("\n🔘 第一步：点击PDF和附件标签的ft-icon-no-icon")
        if not click_pdf_attachments_icon(driver):
            # 首次点击失败，重试一次
            time.sleep(0.2)
            if not click_pdf_attachments_icon(driver):
                print(f"❌ 两次点击PDF和附件图标失败，跳过当前链接")
                return download_pdf(driver, doc_url, retry + 1)

        # 步骤2：等待下载区域加载完成
        time.sleep(5)

        # 步骤3：点击下载PDF按钮的ft-icon-download
        print("\n🔘 第二步：点击PDF下载按钮的ft-icon-download（触发PDF下载）")
        if click_pdf_download_icon(driver):
            # 等待下载完成
            print("⏳ 等待PDF下载完成...")
            time.sleep(8)  # 给下载足够的时间
            print("✅ PDF下载触发成功")
            return True
        else:
            # 下载图标点击失败，重试
            print(f"❌ 点击下载图标失败，重试（{retry+1}/{RETRY_TIMES}）")
            return download_pdf(driver, doc_url, retry + 1)

    except Exception as e:
        print(f"❌ 下载流程异常（重试{retry+1}/{RETRY_TIMES}）：{e}")
        return download_pdf(driver, doc_url, retry + 1)

def main():
    # 创建指定下载目录
    if not os.path.exists(DOWNLOAD_DIR):
        os.makedirs(DOWNLOAD_DIR)
        print(f"📁 创建下载目录：{os.path.abspath(DOWNLOAD_DIR)}")

    driver = None
    try:
        driver = init_driver()
        print(f"🌐 访问AMD搜索页：{SEARCH_URL}")
        driver.get(SEARCH_URL)

        # 等待页面初始渲染
        wait_for_fluidtopics_content(driver)

        # 核心优化：反复点击加载更多，无按钮/连续3次异常时立即停止
        click_load_more_until_all(driver)

        # 提取所有目标格式链接
        target_links = extract_target_links(driver)

        if not target_links:
            print("⚠️ 未提取到任何目标格式的链接！")
            return

        # 关键修改：按核心子目录去重链接
        target_links = deduplicate_links_by_subdirectory(target_links)

        # 打印去重后的统计和预览
        print(f"\n📊 按子目录去重后：剩余 {len(target_links)} 个唯一链接")
        if target_links:
            print("\n📋 去重后的链接预览（前10 + 最后10）：")
            preview_links = target_links[:10] + (target_links[-10:] if len(target_links) > 10 else [])
            for idx, link in enumerate(preview_links, 1):
                print(f"   [{idx}] {link}")
            if len(target_links) > 20:
                print(f"   ... 省略中间{len(target_links)-20}个链接")

        # 批量下载PDF（可选：先打印统计，确认数量后再下载）
        confirm = input(f"\n📌 共提取并去重得到{len(target_links)}个PDF链接，是否开始下载？(y/n)：")
        if confirm.lower() != 'y':
            print("🔚 用户取消下载，程序结束")
            return

        print("\n🚀 开始执行PDF下载流程...")
        success_count = 0
        fail_count = 0
        for idx, url in enumerate(target_links, 1):
            print(f"\n=====================================")
            print(f"[{idx}/{len(target_links)}] 处理链接：{url}")
            print(f"=====================================")
            if download_pdf(driver, url):
                success_count += 1
            else:
                fail_count += 1

        # 最终统计
        print(f"\n📊 下载任务统计：")
        print(f"   🎯 总目标链接数（去重后）：{len(target_links)}")
        print(f"   ✅ 下载成功数：{success_count}")
        print(f"   ❌ 下载失败数：{fail_count}")
        print(f"   📂 PDF保存目录：{os.path.abspath(DOWNLOAD_DIR)}")

        # 验证下载目录文件
        if os.path.exists(DOWNLOAD_DIR):
            downloaded_files = [f for f in os.listdir(DOWNLOAD_DIR) if f.endswith(".pdf")]
            print(f"   📄 目录中已下载的PDF文件数：{len(downloaded_files)}")
            if downloaded_files:
                print("   📋 已下载的PDF文件（前10）：")
                for f in downloaded_files[:10]:
                    print(f"      - {f}")
                if len(downloaded_files) > 10:
                    print(f"      ... 省略中间{len(downloaded_files)-10}个文件")

    except Exception as e:
        print(f"\n💥 程序核心异常：{e}")
        if driver:
            # 保存调试信息
            with open("amd_debug.html", "w", encoding="utf-8") as f:
                f.write(driver.page_source)
            driver.save_screenshot("amd_screenshot.png")
            print("📁 调试文件已保存：amd_debug.html + amd_screenshot.png")
    finally:
        if driver:
            driver.quit()
        print("\n🔚 程序执行结束")

if __name__ == "__main__":
    main()